import { prisma } from "./db/client";
import { effectiveClosesAt } from "./period";
import { monitoringStatus, type MonitoringStatus } from "./monitoring";

export type MonitoringRow = {
  id: string;
  npp: string;
  libraryName: string;
  districtName: string;
  typeName: string;
  typeCode: string;
  typeSortOrder: number;
  status: MonitoringStatus;
  progress: number;
  lastSavedAt: Date | null;
  openFlagCount: number;
  deadline: Date;
  submissionId: string | null;
};

/** FR-10.01–10.03: satu baris per lembaga aktif untuk periode itu (termasuk yang belum pernah mengisi). */
export async function loadMonitoring(periodId: string, now = new Date()) {
  const period = await prisma.surveyPeriod.findFirst({
    where: { id: periodId, deletedAt: null },
    include: { periodExtensions: { where: { deletedAt: null } } },
  });
  if (!period) return null;
  const institutions = await prisma.institution.findMany({
    where: { deletedAt: null },
    include: {
      type: true,
      region: { include: { parent: true } },
      users: { where: { isPrimary: true, deletedAt: null }, select: { status: true } },
      submissions: { where: { periodId } },
    },
    orderBy: { libraryName: "asc" },
  });
  const rows: MonitoringRow[] = institutions.map((i) => {
    const deadline = effectiveClosesAt(period.closesAt, period.periodExtensions, i.id);
    const sub = i.submissions[0];
    return {
      id: i.id,
      npp: i.npp ?? "-",
      libraryName: i.libraryName,
      districtName: i.region?.parent?.name ?? "(tanpa kecamatan)",
      typeName: i.type.name,
      typeCode: i.type.code,
      typeSortOrder: i.type.sortOrder,
      status: monitoringStatus({ primaryAccountStatus: i.users[0]?.status ?? null, submissionStatus: sub?.status ?? null, effectiveClosesAt: deadline, now }),
      progress: Number(sub?.progressPct ?? 0),
      lastSavedAt: sub?.lastSavedAt ?? null,
      openFlagCount: sub?.openFlagCount ?? 0,
      deadline,
      submissionId: sub?.id ?? null,
    };
  });
  return { period, rows };
}

/** Filter dari kartu ringkas (FR-10.01): status tertentu, atau `flag` = punya flag terbuka. */
export function filterRows(rows: MonitoringRow[], filter: { status?: string; flag?: boolean }) {
  return rows.filter((r) => (!filter.status || r.status === filter.status) && (!filter.flag || r.openFlagCount > 0));
}
