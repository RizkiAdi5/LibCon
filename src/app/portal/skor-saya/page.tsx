import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { scoresPublished } from "@/lib/submissionReview";
import { loadReportRows, raporPeers } from "@/lib/reportData";
import { groupMean } from "@/lib/report";
import { RadarChart } from "@/components/radar-chart";
import { buttonVariants } from "@/components/ui/button";

const fmt2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt3 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** PRD §5.11 Skor Saya: FR-12.01 tunggu publikasi, FR-12.02 rincian + pembanding, FR-12.03 ranking opsional, FR-12.04 rapor, FR-12.05 riwayat. */
export default async function SkorSayaPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const user = await requireRole(["PARTICIPANT"]);
  const institutionId = user.institutionId!;
  const { periode } = await searchParams;

  const submissions = await prisma.submission.findMany({
    where: { institutionId, period: { deletedAt: null } },
    include: { period: true, submissionScores: { where: { isCurrent: true }, select: { indexScore: true, category: { select: { name: true } } } } },
    orderBy: { period: { opensAt: "desc" } },
  });
  if (submissions.length === 0) return <p className="text-sm text-muted-foreground">Belum ada survei yang Anda kirim.</p>;
  const current = submissions.find((s) => s.periodId === periode) ?? submissions[0];
  const published = scoresPublished(current.period);

  const rows = published ? await loadReportRows([current.periodId]) : [];
  const mine = rows.find((r) => r.institutionId === institutionId);
  const score = mine?.score;
  const peers = mine ? raporPeers(rows, mine) : [];
  const nodes = Object.entries(score?.nodeInfo ?? {}).sort(([a, x], [b, y]) => (x.level === y.level ? a.localeCompare(b) : x.level === "DIMENSION" ? -1 : 1));
  const subs = nodes.filter(([, i]) => i.level === "SUBDIMENSION");
  const peerMean = (code: string) => groupMean(peers, () => "x", (r) => r.score?.nodes[code])[0]?.mean;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Skor Saya — {current.period.name}</h1>

      {!published || !mine ? (
        <p className="rounded-md border p-4" data-testid="score-pending">
          Penilaian sedang diproses. Skor akan tampil di sini setelah diumumkan panitia.
        </p>
      ) : !score ? (
        <p className="rounded-md border p-4">Kiriman Anda tidak masuk penilaian resmi periode ini.</p>
      ) : (
        <>
          <section className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-sm text-muted-foreground">Indeks</p>
              <p className="text-4xl font-semibold" data-testid="my-index">
                {fmt2.format(score.indexScore)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kategori</p>
              <p className="inline-flex items-center gap-2 text-lg">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: score.categoryColor ?? undefined }} aria-hidden />
                {score.categoryName ?? "–"}
              </p>
            </div>
            {current.period.showRankingToParticipants && (
              <div>
                <p className="text-sm text-muted-foreground">Peringkat</p>
                <p className="text-sm">
                  Keseluruhan {score.rankOverall ?? "–"} · {mine.typeName} {score.rankInType ?? "–"} · Kecamatan {score.rankInDistrict ?? "–"}
                </p>
              </div>
            )}
            <a href={`/portal/skor-saya/rapor?periode=${current.periodId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Unduh rapor PDF
            </a>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th>Komponen</th>
                  <th>Nilai Anda</th>
                  <th>Rata-rata {mine.typeName}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map(([code, info]) => {
                  const m = peerMean(code);
                  return (
                    <tr key={code} className="border-t">
                      <td className={info.level === "DIMENSION" ? "font-medium" : "pl-3"}>{info.name}</td>
                      <td>{fmt3.format(score.nodes[code] ?? 0)}</td>
                      <td>{m === undefined ? "–" : fmt3.format(m)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <RadarChart
              axes={subs.map(([, i]) => i.name)}
              series={[
                { label: "Lembaga Anda", values: subs.map(([c]) => score.nodes[c] ?? 0), className: "fill-primary/30 stroke-primary" },
                { label: `Rata-rata ${mine.typeName}`, values: subs.map(([c]) => peerMean(c) ?? 0), className: "fill-none stroke-muted-foreground" },
              ]}
            />
          </section>
        </>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Riwayat</h2>
        <ul className="space-y-1 text-sm">
          {submissions.map((s) => {
            const sc = scoresPublished(s.period) ? s.submissionScores[0] : undefined;
            return (
              <li key={s.id}>
                <Link href={`/portal/skor-saya?periode=${s.periodId}`} className="underline">
                  {s.period.name}
                </Link>{" "}
                — {sc ? `${fmt2.format(Number(sc.indexScore))}${sc.category ? ` (${sc.category.name})` : ""}` : "belum diumumkan"}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
