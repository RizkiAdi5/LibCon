import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { PERIOD_STATUS } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { FlashMessage } from "@/components/flash-message";
import { createQuestionnaireAction } from "./actions";
import { IconOnly } from "@/components/action-icon";

export default async function KuesionerPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { ok, error } = await searchParams;
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null },
    orderBy: [{ year: "desc" }, { opensAt: "desc" }],
    include: {
      questionnaire: { include: { _count: { select: { questions: { where: { deletedAt: null } } } } } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Kuesioner</h1>
      <FlashMessage ok={ok} error={error} />
      {periods.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada periode. Buat periode dulu di menu <Link href="/admin/periode" className="underline">Periode</Link>.
        </p>
      )}
      <table className="w-full max-w-4xl text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Periode</th>
            <th>Status periode</th>
            <th>Kuesioner</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2">{p.name}</td>
              <td className={PERIOD_STATUS[p.status].className}>{PERIOD_STATUS[p.status].label}</td>
              <td>
                {p.questionnaire
                  ? `${p.questionnaire.status === "PUBLISHED" ? "Terbit" : "Draf"} · ${p.questionnaire._count.questions} soal`
                  : "Belum ada"}
              </td>
              <td className="py-2">
                {p.questionnaire ? (
                  <Link href={`/admin/kuesioner/${p.id}`} className="inline-flex items-center gap-1 hover:underline">
                    <IconOnly label={"Ubah"} text="Buka builder" className="size-3.5" />
                  </Link>
                ) : (
                  p.status !== "ARCHIVED" && (
                    <form action={createQuestionnaireAction}>
                      <input type="hidden" name="periodId" value={p.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Buat kuesioner {p.name}
                      </Button>
                    </form>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
