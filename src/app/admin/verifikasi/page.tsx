import Link from "next/link";
import type { Prisma, SubmissionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { pickPortalPeriod } from "@/lib/answers";
import { SUBMISSION_STATUS } from "@/lib/submissionStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";

type SearchParams = { periode?: string; kecamatan?: string; jenis?: string; status?: string; q?: string; ok?: string; error?: string };
const selectClass = "h-9 rounded-md border px-2 text-sm";

/** FR-08.02: semua kiriman, jumlah flag terbuka + ikon merah, filter wilayah/jenis/status. */
export default async function VerifikasiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const [periods, districts, types] = await Promise.all([
    prisma.surveyPeriod.findMany({ where: { deletedAt: null }, orderBy: [{ year: "desc" }, { opensAt: "desc" }] }),
    prisma.region.findMany({ where: { level: "DISTRICT", deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const period = periods.find((p) => p.id === sp.periode) ?? pickPortalPeriod(periods.filter((p) => p.status !== "ARCHIVED"), new Date()) ?? periods[0];
  const status = sp.status && sp.status in SUBMISSION_STATUS ? (sp.status as SubmissionStatus) : undefined;
  const q = sp.q?.trim();

  const where: Prisma.SubmissionWhereInput = {
    periodId: period?.id ?? "00000000-0000-0000-0000-000000000000",
    ...(status && { status }),
    institution: {
      ...(sp.kecamatan && { region: { parentId: sp.kecamatan } }),
      ...(sp.jenis && { typeId: sp.jenis }),
      ...(q && { OR: [{ npp: { contains: q } }, { libraryName: { contains: q, mode: "insensitive" } }] }),
    },
  };
  const submissions = period
    ? await prisma.submission.findMany({
        where,
        include: { institution: { include: { type: true, region: { include: { parent: true } } } } },
        orderBy: [{ openFlagCount: "desc" }, { lastSubmittedAt: "desc" }],
      })
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Verifikasi</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="periode">Periode</Label>
          <select id="periode" name="periode" defaultValue={period?.id} className={selectClass}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kecamatan">Kecamatan</Label>
          <select id="kecamatan" name="kecamatan" defaultValue={sp.kecamatan ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jenis">Jenis</Label>
          <select id="jenis" name="jenis" defaultValue={sp.jenis ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={status ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {Object.entries(SUBMISSION_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="q">Cari NPP / nama</Label>
          <Input id="q" name="q" defaultValue={q} className="w-48" />
        </div>
        <Button type="submit" variant="outline">
          Terapkan
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">{submissions.length} kiriman</p>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Lembaga</th>
            <th>Kecamatan</th>
            <th>Jenis</th>
            <th>Status</th>
            <th>Flag terbuka</th>
            <th>Dikirim</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="py-2">
                <Link href={`/admin/verifikasi/${s.id}`} className="underline">
                  {s.institution.libraryName}
                </Link>
              </td>
              <td>{s.institution.region.parent?.name}</td>
              <td>{s.institution.type.code}</td>
              <td className={SUBMISSION_STATUS[s.status].className}>{SUBMISSION_STATUS[s.status].label}</td>
              <td>
                {s.openFlagCount > 0 ? (
                  <span className="font-medium text-destructive" data-testid="flag-count">
                    <span aria-hidden>⚑ </span>
                    {s.openFlagCount} flag
                  </span>
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </td>
              <td>{s.lastSubmittedAt ? formatWib(s.lastSubmittedAt) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
