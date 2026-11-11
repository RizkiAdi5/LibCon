import type { SubmissionStatus } from "@/generated/prisma/client";
import { prisma } from "./db/client";
import { withDb } from "./db/withDb";
import { computeScores, pickCategory, rankBy, type ScoringParticipant } from "./formula/scoring";
import { decodeSubmissionAnswers } from "./participantSurvey";
import { loadScheme, loadVariables } from "./scoringData";
import { loadSurveyDefinition } from "./surveyDefinition";

/** Kiriman periode + jawaban per KODE soal (variabel rumus). */
export async function loadParticipants(periodId: string, statuses: SubmissionStatus[]) {
  const questionnaire = await prisma.questionnaire.findFirst({ where: { periodId, deletedAt: null } });
  if (!questionnaire) return [];
  const definition = await loadSurveyDefinition(questionnaire.id);
  const codeOf = new Map(definition.sections.flatMap((s) => s.questions).map((q) => [q.id, q.code]));
  const submissions = await prisma.submission.findMany({
    where: { periodId, status: { in: statuses }, institution: { deletedAt: null } },
    include: { answers: true, institution: { include: { region: true, type: true } } },
  });
  return submissions.map((s) => {
    const byId = decodeSubmissionAnswers(definition, s.answers, s.sectionEvidence);
    const answers: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(byId)) if (codeOf.has(id)) answers[codeOf.get(id)!] = value;
    return {
      submission: s,
      participant: { submissionId: s.id, institutionTypeId: s.institution.typeId, answers } satisfies ScoringParticipant,
    };
  });
}

/**
 * FR-09.07: uji rumus pada skema mana pun (termasuk Draf) tanpa menyimpan apa pun.
 * Populasi min-max = kiriman Terkirim/Terverifikasi periode itu.
 */
export async function testScheme(schemeId: string) {
  const loaded = await loadScheme(schemeId);
  if (!loaded) return null;
  const [variables, rows] = await Promise.all([
    loadVariables(loaded.scheme.periodId),
    loadParticipants(loaded.scheme.periodId, ["SUBMITTED", "NEEDS_REVISION", "VERIFIED"]),
  ]);
  const results = computeScores(loaded, variables, rows.map((r) => r.participant));
  return { loaded, rows, results };
}

/**
 * FR-09.08 + FR-09.09 + BR-13: hitung resmi semua kiriman Terverifikasi dengan
 * skema AKTIF. Skor baru menjadi yang berlaku (is_current); skor lama tetap
 * tersimpan dengan versi skemanya. Harus dipanggil dalam request context.
 */
export async function runOfficialScoring(schemeId: string, actorId: string) {
  const loaded = await loadScheme(schemeId);
  if (!loaded || loaded.scheme.status !== "ACTIVE") throw new Error("Hanya skema Aktif yang bisa dipakai hitung resmi");
  const [variables, rows] = await Promise.all([loadVariables(loaded.scheme.periodId), loadParticipants(loaded.scheme.periodId, ["VERIFIED"])]);

  const run = await withDb((tx) =>
    tx.scoreRun.create({ data: { schemeId, mode: "OFFICIAL", status: "RUNNING", triggeredById: actorId, startedAt: new Date(), createdBy: actorId } }),
  );
  try {
    const results = computeScores(loaded, variables, rows.map((r) => r.participant));
    const scored = results.map((r) => ({ ...r, row: rows.find((x) => x.submission.id === r.submissionId)! }));
    const overall = rankBy(scored, (s) => s.indexScore);
    const inType = rankBy(scored, (s) => s.indexScore, (s) => s.row.submission.institution.typeId);
    const inDistrict = rankBy(scored, (s) => s.indexScore, (s) => s.row.submission.institution.region.parentId ?? "");

    await withDb(async (tx) => {
      // partial unique Tahap 3: satu skor is_current per kiriman — matikan yang lama dulu
      await tx.submissionScore.updateMany({ where: { submission: { periodId: loaded.scheme.periodId }, isCurrent: true }, data: { isCurrent: false, updatedBy: actorId } });
      for (const s of scored) {
        await tx.submissionScore.create({
          data: {
            runId: run.id,
            submissionId: s.submissionId,
            schemeId,
            indexScore: s.indexScore,
            categoryId: pickCategory(loaded.categories, s.indexScore)?.id ?? null,
            rankOverall: overall.get(s),
            rankInType: inType.get(s),
            rankInDistrict: inDistrict.get(s),
            isCurrent: true,
            createdBy: actorId,
            details: {
              create: [...s.nodes.entries()].map(([nodeId, d]) => ({
                nodeId,
                rawValue: d.raw,
                normalizedValue: d.normalized,
                weightedValue: d.weighted,
                createdBy: actorId,
              })),
            },
          },
        });
      }
      await tx.scoreRun.update({ where: { id: run.id }, data: { status: "DONE", submissionCount: scored.length, finishedAt: new Date(), updatedBy: actorId } });
    });
    return { runId: run.id, count: scored.length };
  } catch (error) {
    await withDb((tx) =>
      tx.scoreRun.update({ where: { id: run.id }, data: { status: "FAILED", errorLog: error instanceof Error ? error.message : String(error), finishedAt: new Date(), updatedBy: actorId } }),
    );
    throw error;
  }
}
