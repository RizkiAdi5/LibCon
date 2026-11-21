import { z } from "zod";
import { prisma } from "./db/client";
import { fillStatus, gridTotals, lastClosedMonth, monthGrid, openMonths, wibYearMonth, type FillStatus, type MonthCell } from "./visitors";

/** Loader rekap pengunjung untuk admin (halaman monitoring & ekspor memakai filter yang sama). */

const single = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const visitorFilterSchema = z.object({
  tahun: z.preprocess(single, z.coerce.number().int().min(2020).max(2100).optional()),
  jenis: z.preprocess((v) => emptyToUndefined(single(v)), z.uuid().optional()),
  kecamatan: z.preprocess((v) => emptyToUndefined(single(v)), z.uuid().optional()),
  status: z.preprocess((v) => emptyToUndefined(single(v)), z.enum(["COMPLETE", "PARTIAL", "EMPTY"]).optional()),
  q: z.preprocess((v) => emptyToUndefined(single(v)), z.string().trim().max(100).optional()),
});
export type VisitorFilter = z.infer<typeof visitorFilterSchema>;

export function parseVisitorFilter(params: Record<string, string | string[] | undefined>): VisitorFilter {
  const parsed = visitorFilterSchema.safeParse(params);
  return parsed.success ? parsed.data : {};
}

export type VisitorRow = {
  institutionId: string;
  name: string;
  npp: string | null;
  typeName: string;
  typeCode: string;
  districtName: string;
  grid: MonthCell[];
  totals: ReturnType<typeof gridTotals>;
  status: FillStatus;
  filledLastMonth: boolean;
};

export async function loadVisitorRecap(filter: VisitorFilter, now = new Date()) {
  const year = filter.tahun ?? wibYearMonth(now).year;
  const open = openMonths(year, now);
  const last = lastClosedMonth(now);

  const institutions = await prisma.institution.findMany({
    where: {
      deletedAt: null,
      typeId: filter.jenis,
      region: filter.kecamatan ? { parentId: filter.kecamatan } : undefined,
      ...(filter.q
        ? { OR: [{ libraryName: { contains: filter.q, mode: "insensitive" } }, { institutionName: { contains: filter.q, mode: "insensitive" } }, { npp: { contains: filter.q } }] }
        : {}),
    },
    include: {
      type: true,
      region: { include: { parent: true } },
      visitorReports: { where: { year }, select: { month: true, male: true, female: true } },
    },
    orderBy: [{ type: { sortOrder: "asc" } }, { institutionName: "asc" }],
  });

  const all: VisitorRow[] = institutions.map((i) => {
    const grid = monthGrid(i.visitorReports);
    return {
      institutionId: i.id,
      name: i.institutionName,
      npp: i.npp,
      typeName: i.type.name,
      typeCode: i.type.code,
      districtName: i.region?.parent?.name ?? "–",
      grid,
      totals: gridTotals(grid),
      status: fillStatus(grid, open),
      filledLastMonth: last.year === year && grid[last.month - 1] !== null,
    };
  });
  const rows = filter.status ? all.filter((r) => r.status === filter.status) : all;

  // total per bulan dari baris yang tampil
  const monthTotals = Array.from({ length: 12 }, (_, m) => {
    let male = 0;
    let female = 0;
    let filled = 0;
    for (const r of rows) {
      const c = r.grid[m];
      if (!c) continue;
      male += c.male;
      female += c.female;
      filled++;
    }
    return { male, female, total: male + female, filled };
  });

  return { year, open, last, rows, monthTotals };
}

export async function loadVisitorFilterOptions() {
  const [types, districts] = await Promise.all([
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.region.findMany({ where: { level: "DISTRICT", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { types, districts };
}
