import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { monthGrid, openMonths, wibYearMonth } from "@/lib/visitors";
import { VisitorForm } from "./visitor-form";

export default async function KunjunganPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const user = await requireRole(["PARTICIPANT"]);
  const now = new Date();
  const current = wibYearMonth(now).year;
  const requested = Number((await searchParams).tahun);
  const year = Number.isInteger(requested) && requested >= current - 5 && requested <= current ? requested : current;
  const institutionId = user.institutionId!;

  const [rows, years] = await Promise.all([
    prisma.visitorReport.findMany({ where: { institutionId, year }, orderBy: { month: "asc" } }),
    prisma.visitorReport.findMany({ where: { institutionId }, distinct: ["year"], select: { year: true } }),
  ]);
  const yearOptions = [...new Set([current, current - 1, ...years.map((y) => y.year)])].filter((y) => y >= current - 5).sort((a, b) => b - a);
  const updatedAt: (string | null)[] = Array(12).fill(null);
  for (const r of rows) updatedAt[r.month - 1] = formatWib(r.updatedAt);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rekap Kunjungan Perpustakaan</h1>
        <p className="text-sm text-muted-foreground">
          Isi jumlah pengunjung perpustakaan setiap bulan (laki-laki dan perempuan). Data ini menjadi bagian penilaian dan
          dipantau admin. Bulan yang dikosongkan tidak menghapus isian sebelumnya; koreksi cukup dengan mengganti angkanya.
        </p>
      </div>
      <nav className="flex gap-2 text-sm" aria-label="Tahun">
        {yearOptions.map((y) => (
          <Link
            key={y}
            href={`/portal/kunjungan?tahun=${y}`}
            className={y === year ? "rounded-md bg-primary px-3 py-1 text-primary-foreground" : "rounded-md border px-3 py-1"}
            aria-current={y === year ? "page" : undefined}
          >
            {y}
          </Link>
        ))}
      </nav>
      {/* key: form di-reset saat pindah tahun */}
      <VisitorForm key={year} year={year} open={openMonths(year, now)} grid={monthGrid(rows)} updatedAt={updatedAt} />
    </div>
  );
}
