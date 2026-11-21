import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { LEVEL_LABEL } from "@/lib/scoringData";
import { testScheme } from "@/lib/scoringRun";
import { scoresPublished } from "@/lib/submissionReview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { officialRunAction, publishScoresAction, unpublishScoresAction } from "../../actions";

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
const fmt2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LEVEL_ORDER = { INDEX: 0, DIMENSION: 1, SUBDIMENSION: 2, INDICATOR: 3 } as const;

/** FR-09.07 uji rumus, FR-09.08/09.09 hitung resmi & riwayat, FR-09.11 publikasi. */
export default async function HitungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; uji?: string }>;
}) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const test = await testScheme(id);
  if (!test) notFound();
  const { loaded, rows, results } = test;
  const { scheme } = loaded;
  const superAdmin = user.role === "SUPER_ADMIN";

  const [current, runs] = await Promise.all([
    prisma.submissionScore.findMany({
      where: { isCurrent: true, submission: { periodId: scheme.periodId } },
      include: { category: true, scheme: true, submission: { include: { institution: { include: { type: true, region: { include: { parent: true } } } } } } },
      orderBy: [{ rankOverall: "asc" }],
    }),
    prisma.scoreRun.findMany({ where: { scheme: { periodId: scheme.periodId } }, include: { scheme: true, triggeredBy: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const published = scoresPublished(scheme.period);
  const selected = results.find((r) => r.submissionId === sp.uji);
  const nodes = [...loaded.nodes].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return (
    <div className="max-w-5xl space-y-6">
      <Link href={`/admin/skoring/${scheme.id}`} className="text-sm underline">
        ← Editor skema
      </Link>
      <div>
        <h1 className="text-xl font-semibold">
          Uji & hitung: {scheme.name} v{scheme.version}
        </h1>
        <p className="text-sm">
          {scheme.period.name} · publikasi skor:{" "}
          {published ? <span className="text-green-700">dipublikasikan {formatWib(scheme.period.scoresPublishedAt!)}</span> : <span className="text-muted-foreground">belum dipublikasikan</span>}
        </p>
      </div>
      <FlashMessage ok={sp.ok} error={sp.error} />

      {/* FR-09.07: uji tanpa menyimpan sebagai skor resmi */}
      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-semibold">Uji rumus</h2>
        <p className="text-sm text-muted-foreground">Hitung pada kiriman terpilih memakai skema ini (termasuk Draf). Tidak disimpan sebagai skor resmi.</p>
        {rows.length === 0 ? (
          <p className="text-sm">Belum ada kiriman Terkirim/Terverifikasi di periode ini.</p>
        ) : (
          <form className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="uji">Kiriman</Label>
              <select id="uji" name="uji" defaultValue={sp.uji} className="h-9 rounded-md border px-2 text-sm">
                {rows.map((r) => (
                  <option key={r.submission.id} value={r.submission.id}>
                    {r.submission.institution.libraryName}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              Uji
            </Button>
          </form>
        )}
        {selected && (
          <div data-testid="test-result">
            <p className="font-medium">Indeks: {fmt2.format(selected.indexScore)}</p>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Node</th>
                  <th>Nilai mentah</th>
                  <th>Ternormalisasi (0–1)</th>
                  <th>Tertimbang</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const d = selected.nodes.get(n.id);
                  return (
                    <tr key={n.id} className="border-t">
                      <td className="py-1">
                        {LEVEL_LABEL[n.level]}: {n.name} <code className="text-xs">{n.code}</code>
                      </td>
                      <td>{d?.raw === null || d?.raw === undefined ? <span className="text-muted-foreground">tidak ada data</span> : fmt.format(d.raw)}</td>
                      <td>{d ? fmt.format(d.normalized) : "–"}</td>
                      <td>{d?.weighted === null || d?.weighted === undefined ? "–" : fmt.format(d.weighted)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {superAdmin && (
        <section className="flex flex-wrap items-start gap-4">
          {scheme.status === "ACTIVE" ? (
            <ConfirmAction
              action={officialRunAction}
              fields={{ schemeId: scheme.id }}
              label="Hitung resmi"
              confirmLabel="Ya, hitung resmi"
              impact="Semua kiriman Terverifikasi dihitung ulang. Skor baru menjadi yang berlaku; skor lama tetap tersimpan di riwayat bersama versi rumusnya."
            />
          ) : (
            <p className="text-sm text-muted-foreground">Hitung resmi hanya bisa dengan skema berstatus Aktif.</p>
          )}
          {current.length > 0 && !published && (
            <ConfirmAction
              action={publishScoresAction}
              fields={{ schemeId: scheme.id }}
              label="Publikasikan skor"
              confirmLabel="Ya, publikasikan"
              impact={`Skor ${current.length} lembaga tampil di portal peserta dan email pemberitahuan dikirim ke semua akun lembaga itu.`}
            />
          )}
          {published && (
            <details>
              <summary className="cursor-pointer text-sm text-destructive underline">Tarik publikasi</summary>
              <form action={unpublishScoresAction} className="mt-2 w-80 space-y-2 rounded-md border border-destructive/50 p-3">
                <input type="hidden" name="schemeId" value={scheme.id} />
                <Label htmlFor="reason">Alasan penarikan</Label>
                <textarea id="reason" name="reason" required className="min-h-12 w-full rounded-md border p-2 text-sm" />
                <Button type="submit" variant="destructive" size="sm">
                  Tarik publikasi
                </Button>
              </form>
            </details>
          )}
        </section>
      )}

      {/* FR-09.08: skor berlaku + kategori + ranking keseluruhan/jenis/kecamatan */}
      <section className="space-y-2">
        <h2 className="font-semibold">Skor resmi yang berlaku ({current.length})</h2>
        {current.length > 0 && (
          <table className="w-full text-sm" data-testid="official-scores">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Peringkat</th>
                <th>Lembaga</th>
                <th>Skor</th>
                <th>Kategori</th>
                <th>Per jenis</th>
                <th>Per kecamatan</th>
                <th>Versi rumus</th>
              </tr>
            </thead>
            <tbody>
              {current.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-1">{s.rankOverall}</td>
                  <td>{s.submission.institution.libraryName}</td>
                  <td>{fmt2.format(Number(s.indexScore))}</td>
                  <td>
                    {s.category && (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.category.color ?? undefined }} aria-hidden />
                        {s.category.name}
                      </span>
                    )}
                  </td>
                  <td>
                    {s.rankInType} ({s.submission.institution.type.code})
                  </td>
                  <td>
                    {s.rankInDistrict} ({s.submission.institution.region?.parent?.name})
                  </td>
                  <td>v{s.scheme.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* FR-09.09 + AC M09: riwayat perhitungan dengan versi rumus */}
      <section className="space-y-2">
        <h2 className="font-semibold">Riwayat perhitungan</h2>
        <ul className="space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id}>
              {formatWib(r.createdAt)} · {r.scheme.name} v{r.scheme.version} · {r.mode === "OFFICIAL" ? "Resmi" : "Uji"} ·{" "}
              <span className={r.status === "DONE" ? "text-green-700" : r.status === "FAILED" ? "text-destructive" : "text-amber-700"}>
                {r.status === "DONE" ? "Selesai" : r.status === "FAILED" ? "Gagal" : "Berjalan"}
              </span>{" "}
              · {r.submissionCount} kiriman · oleh {r.triggeredBy.fullName}
              {r.errorLog && <span className="text-destructive"> — {r.errorLog}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
