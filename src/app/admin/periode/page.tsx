import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { PERIOD_STATUS } from "@/lib/period";
import { FlashMessage } from "@/components/flash-message";
import { PeriodForm } from "./period-form";

export default async function PeriodePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]); // Admin lihat saja (PRD §8)
  const { ok, error } = await searchParams;
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null },
    orderBy: [{ year: "desc" }, { opensAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Periode</h1>
      <FlashMessage ok={ok} error={error} />

      <table className="w-full max-w-4xl text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Nama</th>
            <th>Tahun</th>
            <th>Buka</th>
            <th>Tutup</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2">
                <Link href={`/admin/periode/${p.id}`} className="underline">
                  {p.name}
                </Link>
              </td>
              <td>{p.year}</td>
              <td>{formatWib(p.opensAt)}</td>
              <td>{formatWib(p.closesAt)}</td>
              <td className={PERIOD_STATUS[p.status].className}>{PERIOD_STATUS[p.status].label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {periods.length === 0 && <p className="text-sm text-muted-foreground">Belum ada periode.</p>}

      {user.role === "SUPER_ADMIN" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Buat periode</h2>
          <PeriodForm />
        </section>
      )}
    </div>
  );
}
