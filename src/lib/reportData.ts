import { prisma } from "./db/client";
import { effectiveClosesAt } from "./period";
import { monitoringStatus } from "./monitoring";
import { decodeSubmissionAnswers } from "./participantSurvey";
import { loadSurveyDefinition } from "./surveyDefinition";
import { getAppSetting } from "./settings";
import { evidenceKey } from "./answers";
import { applyReportFilter, parseReportFilter, type ReportRow } from "./report";

/** Ekspor (FR-11.05–11.07): filter dari query URL yang sama dengan halaman report. */
export async function loadFilteredReport(params: URLSearchParams) {
  const filter = parseReportFilter(Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)])));
  const allRows = await loadReportRows(filter.periode);
  return { filter, rows: applyReportFilter(allRows, filter), allRows };
}

/** Pembanding rapor: kiriman berskor dengan jenis & periode yang sama (tidak terpengaruh filter). */
export function raporPeers(allRows: ReportRow[], row: ReportRow) {
  return allRows.filter((r) => r.score && r.periodId === row.periodId && r.typeId === row.typeId);
}

/** Identitas untuk kolom Provinsi & KEW_NORM ekspor IPLM (app_settings `iplm_export`). */
export function getIplmIdentity() {
  return getAppSetting<{ provinsi: string; kewNorm: string }>("iplm_export", { provinsi: "", kewNorm: "KAB/KOTA" });
}

/**
 * Satu baris per lembaga aktif per periode terpilih: status, skor BERLAKU
 * (is_current) + nilai node, jawaban per kode soal. Lembaga nonaktif tidak
 * masuk report default (FR-03.10).
 */
export async function loadReportRows(periodIds: string[], now = new Date()): Promise<ReportRow[]> {
  if (periodIds.length === 0) return [];
  const [periods, institutions, submissions] = await Promise.all([
    prisma.surveyPeriod.findMany({
      where: { id: { in: periodIds }, deletedAt: null },
      include: { periodExtensions: { where: { deletedAt: null } }, questionnaire: true },
    }),
    prisma.institution.findMany({
      where: { deletedAt: null },
      include: { type: true, region: { include: { parent: { include: { parent: true } } } }, users: { where: { isPrimary: true, deletedAt: null }, select: { status: true } } },
      orderBy: { libraryName: "asc" },
    }),
    prisma.submission.findMany({
      where: { periodId: { in: periodIds } },
      include: {
        answers: true,
        submissionScores: {
          where: { isCurrent: true },
          include: {
            category: true,
            scheme: true,
            // tabel ranking & ekspor IPLM hanya butuh dimensi & subdimensi (indikator bisa puluhan)
            details: { where: { node: { level: { in: ["DIMENSION", "SUBDIMENSION"] } } }, include: { node: { select: { code: true, name: true, level: true } } } },
          },
        },
      },
    }),
  ]);
  const definitions = new Map(
    await Promise.all(periods.filter((p) => p.questionnaire).map(async (p) => [p.id, await loadSurveyDefinition(p.questionnaire!.id)] as const)),
  );
  const subKey = (periodId: string, institutionId: string) => `${periodId}:${institutionId}`;
  const subs = new Map(submissions.map((s) => [subKey(s.periodId, s.institutionId), s]));

  return periods.flatMap((p) => {
    const definition = definitions.get(p.id);
    const codeOf = new Map((definition?.sections ?? []).flatMap((s) => s.questions).map((q) => [q.id, q.code]));
    return institutions.map((i): ReportRow => {
      const sub = subs.get(subKey(p.id, i.id));
      const score = sub?.submissionScores[0];
      const byId = sub && definition ? decodeSubmissionAnswers(definition, sub.answers, sub.sectionEvidence) : {};
      const answers: Record<string, unknown> = {};
      for (const [id, value] of Object.entries(byId)) if (codeOf.has(id)) answers[codeOf.get(id)!] = value;
      const evidenceUrls = (definition?.sections ?? []).map((s) => byId[evidenceKey("section", s.id)]).filter((u): u is string => typeof u === "string" && !!u);
      const district = i.region.parent;
      return {
        periodId: p.id,
        periodName: p.name,
        periodYear: p.year,
        passingScore: Number(p.passingScore),
        institutionId: i.id,
        npp: i.npp,
        npsn: i.npsn,
        libraryName: i.libraryName,
        institutionName: i.institutionName,
        address: i.address,
        whatsapp: i.whatsapp,
        picName: i.picName,
        submitterName: sub?.submitterName ?? null,
        cityName: district?.parent?.name ?? "",
        districtId: district?.id ?? "",
        districtName: district?.name ?? "(tanpa kecamatan)",
        villageId: i.regionId,
        typeId: i.typeId,
        typeCode: i.type.code,
        typeName: i.type.name,
        status: monitoringStatus({
          primaryAccountStatus: i.users[0]?.status ?? null,
          submissionStatus: sub?.status ?? null,
          effectiveClosesAt: effectiveClosesAt(p.closesAt, p.periodExtensions, i.id),
          now,
        }),
        openFlagCount: sub?.openFlagCount ?? 0,
        submissionId: sub?.id ?? null,
        score: score
          ? {
              indexScore: Number(score.indexScore),
              categoryId: score.categoryId,
              categoryName: score.category?.name ?? null,
              categoryColor: score.category?.color ?? null,
              rankOverall: score.rankOverall,
              rankInType: score.rankInType,
              rankInDistrict: score.rankInDistrict,
              schemeVersion: score.scheme.version,
              nodes: Object.fromEntries(score.details.map((d) => [d.node.code, Number(d.normalizedValue ?? 0)])),
              nodeInfo: Object.fromEntries(score.details.map((d) => [d.node.code, { name: d.node.name, level: d.node.level }])),
            }
          : null,
        answers,
        evidenceUrls,
      };
    });
  });
}
