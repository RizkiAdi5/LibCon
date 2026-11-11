import { prisma } from "./db/client";
import { decodeAnswer, evidenceKey, pickPortalPeriod, surveyMode } from "./answers";
import { effectiveClosesAt } from "./period";
import { loadSurveyDefinition } from "./surveyDefinition";
import { isEmpty, progressPct, validateAnswers, type Answers } from "./validation/engine";

/**
 * Konteks survei portal untuk satu lembaga: periode yang tampil, kuesioner
 * terbit, kiriman + jawaban (dalam format mesin validasi), dan mode
 * (hitung mundur / bisa diisi / sudah dikirim / ditutup). institutionId
 * SELALU dari sesi, bukan dari klien.
 */
export async function loadParticipantSurvey(institutionId: string, now = new Date()) {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId }, include: { type: true } });
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null, status: { not: "ARCHIVED" }, questionnaire: { status: "PUBLISHED", deletedAt: null } },
    include: { questionnaire: true, periodExtensions: { where: { deletedAt: null } } },
  });
  const period = pickPortalPeriod(periods, now);
  if (!period?.questionnaire) return null;

  const closesAt = effectiveClosesAt(period.closesAt, period.periodExtensions, institutionId);
  const [submission, definition] = await Promise.all([
    prisma.submission.findUnique({
      where: { periodId_institutionId: { periodId: period.id, institutionId } },
      include: { answers: true },
    }),
    loadSurveyDefinition(period.questionnaire.id),
  ]);

  const typeOf = new Map(definition.sections.flatMap((s) => s.questions).map((q) => [q.id, q.type]));
  const answers: Answers = {};
  for (const a of submission?.answers ?? []) {
    const type = typeOf.get(a.questionId);
    if (!type) continue; // soal yang sudah dihapus dari kuesioner
    answers[a.questionId] = decodeAnswer(type, a);
    if (a.evidenceUrl) answers[evidenceKey("question", a.questionId)] = a.evidenceUrl;
  }
  for (const [sectionId, url] of Object.entries((submission?.sectionEvidence ?? {}) as Record<string, string>)) {
    answers[evidenceKey("section", sectionId)] = url;
  }

  return {
    institution,
    period,
    effectiveClosesAt: closesAt,
    submission,
    definition,
    answers,
    mode: surveyMode({ periodStatus: period.status, opensAt: period.opensAt, effectiveClosesAt: closesAt, submissionStatus: submission?.status ?? null, now }),
  };
}

export type ParticipantSurvey = NonNullable<Awaited<ReturnType<typeof loadParticipantSurvey>>>;

/**
 * Jawaban periode lalu lembaga yang sama, dipetakan ke id soal periode ini
 * lewat questions.copied_from_id (ERD) — untuk aturan YOY_CHANGE.
 */
async function loadPreviousAnswers(survey: ParticipantSurvey): Promise<Answers> {
  const links = await prisma.question.findMany({
    where: { id: { in: survey.definition.sections.flatMap((s) => s.questions.map((q) => q.id)) }, copiedFromId: { not: null } },
    select: { id: true, type: true, copiedFromId: true },
  });
  if (links.length === 0) return {};
  const previous = await prisma.answer.findMany({
    where: { questionId: { in: links.map((l) => l.copiedFromId!) }, submission: { institutionId: survey.institution.id } },
  });
  const result: Answers = {};
  for (const link of links) {
    const a = previous.find((p) => p.questionId === link.copiedFromId);
    if (a) result[link.id] = decodeAnswer(link.type, a);
  }
  return result;
}

/**
 * Pemeriksaan sebelum kirim (FR-07.08, FR-08.01) memakai jawaban dari DB —
 * sumber kebenaran, bukan dari klien. Blokir menahan kirim; Flag dicatat untuk admin.
 */
export async function checkSubmission(survey: ParticipantSurvey) {
  const questions = survey.definition.sections.flatMap((s) => s.questions);
  const result = validateAnswers({
    questions,
    rules: survey.definition.rules,
    conditions: survey.definition.conditions,
    answers: survey.answers,
    institutionTypeId: survey.institution.typeId,
    institutionTypeCode: survey.institution.type.code,
    previousAnswers: await loadPreviousAnswers(survey),
  });
  // FR-06.08: bagian yang mewajibkan link bukti dukung (hanya bagian yang punya soal tampil)
  const missingEvidence = survey.definition.sections.filter(
    (s) => s.evidenceRequired && s.questions.some((q) => result.visible.has(q.id)) && isEmpty(survey.answers[evidenceKey("section", s.id)]),
  );
  return {
    ...result,
    blocks: result.issues.filter((i) => i.severity === "BLOCK"),
    flags: result.issues.filter((i) => i.severity === "FLAG"),
    missingEvidence,
    progress: progressPct(questions, survey.definition.conditions, survey.answers, survey.institution.typeId),
  };
}
