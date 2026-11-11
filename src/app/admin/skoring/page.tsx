import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { SCHEME_STATUS } from "@/lib/scoringData";
import { copySchemeAction, createSchemeAction } from "./actions";

/** FR-09.01 + FR-09.12: skema per periode (beberapa versi, satu Aktif), salin dari periode lalu. */
export default async function SkoringPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]); // Admin lihat saja (PRD §8)
  const { ok, error } = await searchParams;
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null, status: { not: "ARCHIVED" } },
    orderBy: [{ year: "desc" }, { opensAt: "desc" }],
    include: { scoringSchemes: { where: { deletedAt: null }, orderBy: { version: "desc" } } },
  });
  const allSchemes = await prisma.scoringScheme.findMany({
    where: { deletedAt: null },
    include: { period: true },
    orderBy: [{ period: { year: "desc" } }, { version: "desc" }],
  });
  const superAdmin = user.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Skoring</h1>
      <FlashMessage ok={ok} error={error} />
      {periods.map((p) => (
        <section key={p.id} className="max-w-4xl space-y-3 rounded-md border p-4">
          <h2 className="font-semibold">{p.name}</h2>
          {p.scoringSchemes.length === 0 && <p className="text-sm text-muted-foreground">Belum ada skema skor.</p>}
          <ul className="space-y-1 text-sm">
            {p.scoringSchemes.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/skoring/${s.id}`} className="underline">
                  {s.name} v{s.version}
                </Link>{" "}
                · <span className={SCHEME_STATUS[s.status].className}>{SCHEME_STATUS[s.status].label}</span>
                {s.activatedAt && <> · diaktifkan {formatWib(s.activatedAt)}</>}
              </li>
            ))}
          </ul>
          {superAdmin && (
            <div className="flex flex-wrap items-end gap-4">
              <form action={createSchemeAction}>
                <input type="hidden" name="periodId" value={p.id} />
                <Button type="submit" variant="outline" size="sm">
                  Buat skema baru (preset 30/70) untuk {p.name}
                </Button>
              </form>
              {allSchemes.length > 0 && (
                <form action={copySchemeAction} className="flex items-end gap-2">
                  <input type="hidden" name="periodId" value={p.id} />
                  <div className="space-y-1">
                    <Label htmlFor={`src-${p.id}`}>Salin dari skema</Label>
                    <select id={`src-${p.id}`} name="sourceId" className="h-8 rounded-md border px-2 text-sm">
                      {allSchemes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.period.name} — {s.name} v{s.version}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    Salin
                  </Button>
                </form>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
