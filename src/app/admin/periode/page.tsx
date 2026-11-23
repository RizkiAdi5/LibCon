import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { PERIOD_STATUS } from "@/lib/period";
import { FlashMessage } from "@/components/flash-message";
import { ActionIcon } from "@/components/action-icon";
import { buttonVariants } from "@/components/ui/button";

export default async function PeriodePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]); // Admin lihat saja (PRD §8)
  const { ok, error } = await searchParams;
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null },
    orderBy: [{ year: "desc" }, { opensAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Periode</h1>
        {user.role === "SUPER_ADMIN" && (
          <Link href="/admin/periode/baru" className={buttonVariants()}>
            <ActionIcon label="Buat periode" />
            Buat periode
          </Link>
        )}
      </div>
      <FlashMessage ok={ok} error={error} />

      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada periode.</p>
      ) : (
        <div className="box max-w-4xl p-5">
          <table className="w-full text-sm">
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
                    <Link href={`/admin/periode/${p.id}`} className="font-medium hover:text-brand">
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
        </div>
      )}
    </div>
  );
}
