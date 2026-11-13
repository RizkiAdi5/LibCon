import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { validateScheme, type ScoreNodeDef } from "@/lib/formula/scoring";
import { AGGREGATION_LABEL, LEVEL_LABEL, loadScheme, loadVariables, NORMALIZATION_LABEL, SCHEME_STATUS } from "@/lib/scoringData";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { RecordHistory } from "@/components/record-history";
import {
  activateSchemeAction,
  copySchemeAction,
  deleteCategoryAction,
  deleteEdgeAction,
  deleteNodeAction,
  deleteOverrideAction,
  saveCategoryAction,
  saveEdgeAction,
  saveNodeAction,
  saveOverrideAction,
} from "../actions";
import { FormulaInput } from "./formula-input";

const LEVELS = ["INDEX", "DIMENSION", "SUBDIMENSION", "INDICATOR"] as const;
const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const selectClass = "h-9 rounded-md border px-2 text-sm";
const rangesText = (n: ScoreNodeDef) => (n.params?.ranges ?? []).map((r) => `${fmt.format(r.min)}-${r.max === null ? "" : fmt.format(r.max)}=${fmt.format(r.score)}`).join("\n");

/** FR-09.02–09.06, 09.10: editor graf node, bobot, normalisasi, kategori. Super Admin ubah (Draf), Admin lihat. */
export default async function SkemaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const loaded = await loadScheme(id);
  if (!loaded) notFound();
  const { scheme, nodes, edges, categories } = loaded;
  const [variables, types, historyNodes, historyCategories] = await Promise.all([
    loadVariables(scheme.periodId),
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.scoreNode.findMany({ where: { schemeId: scheme.id }, select: { id: true } }),
    prisma.scoreCategory.findMany({ where: { schemeId: scheme.id }, select: { id: true } }),
  ]);
  const history = { nodes: historyNodes, categories: historyCategories };
  const editable = user.role === "SUPER_ADMIN" && scheme.status === "DRAFT";
  const problems = validateScheme(nodes, edges, variables);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const overrideRows = new Map(scheme.nodes.map((n) => [n.id, n.typeOverrides]));
  const vars = variables.map((v) => ({ code: v.code, label: v.label }));
  const status = SCHEME_STATUS[scheme.status];

  const nodeFields = (n?: ScoreNodeDef) => (
    <div className="grid gap-2 md:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor={`level-${n?.id ?? "new"}`}>Level</Label>
        <select id={`level-${n?.id ?? "new"}`} name="level" defaultValue={n?.level ?? "INDICATOR"} className={selectClass}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`code-${n?.id ?? "new"}`}>Kode node</Label>
        <Input id={`code-${n?.id ?? "new"}`} name="code" defaultValue={n?.code} className="font-mono" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`name-${n?.id ?? "new"}`}>Nama node</Label>
        <Input id={`name-${n?.id ?? "new"}`} name="name" defaultValue={n?.name} required />
      </div>
      <div className="space-y-1 md:col-span-3">
        <Label htmlFor={`formula-${n?.id ?? "new"}`}>Rumus (indikator: dari kode soal; agregasi Rumus: dari kode node anak)</Label>
        <FormulaInput id={`formula-${n?.id ?? "new"}`} name="formula" defaultValue={n?.formula ?? ""} variables={vars} label={`Rumus ${n?.code ?? "node baru"}`} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`norm-${n?.id ?? "new"}`}>Normalisasi</Label>
        <select id={`norm-${n?.id ?? "new"}`} name="normalization" defaultValue={n?.normalization ?? "NONE"} className={selectClass}>
          {Object.entries(NORMALIZATION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`target-${n?.id ?? "new"}`}>Target (rasio terhadap target)</Label>
        <Input id={`target-${n?.id ?? "new"}`} name="target" inputMode="decimal" defaultValue={n?.params?.target ?? ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`agg-${n?.id ?? "new"}`}>Agregasi anak</Label>
        <select id={`agg-${n?.id ?? "new"}`} name="aggregation" defaultValue={n?.aggregation ?? "WEIGHTED_SUM"} className={selectClass}>
          {Object.entries(AGGREGATION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1 md:col-span-3">
        <Label htmlFor={`ranges-${n?.id ?? "new"}`}>Tabel ambang (satu per baris: min-maks=skor, maks kosong = tanpa batas)</Label>
        <textarea id={`ranges-${n?.id ?? "new"}`} name="ranges" defaultValue={n ? rangesText(n) : ""} placeholder={"0-2=0,25\n2-5=0,5\n5-10=0,75\n10-=1"} className="min-h-16 w-full rounded-md border p-2 font-mono text-sm" />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/admin/skoring" className="text-sm underline">
        ← Daftar skema
      </Link>
      <div>
        <h1 className="text-xl font-semibold">
          {scheme.name} v{scheme.version}
        </h1>
        <p className="text-sm">
          {scheme.period.name} · Status: <span className={status.className}>{status.label}</span> · Skala {fmt.format(loaded.scale)}
        </p>
      </div>
      <FlashMessage ok={ok} error={error} />

      <section className="flex flex-wrap items-start gap-4">
        <Link href={`/admin/skoring/${scheme.id}/hitung`} className={buttonVariants({ variant: "outline" })}>
          Uji & hitung skor
        </Link>
        {editable && problems.length === 0 && (
          <ConfirmAction
            action={activateSchemeAction}
            fields={{ schemeId: scheme.id }}
            label="Aktifkan skema"
            confirmLabel="Ya, aktifkan"
            impact="Skema aktif lain di periode ini diarsipkan. Skema aktif tidak bisa diubah; perubahan rumus lewat versi baru."
          />
        )}
        {user.role === "SUPER_ADMIN" && (
          <form action={copySchemeAction}>
            <input type="hidden" name="sourceId" value={scheme.id} />
            <input type="hidden" name="periodId" value={scheme.periodId} />
            <Button type="submit" variant="outline" size="sm">
              Buat versi baru (Draf)
            </Button>
          </form>
        )}
      </section>

      {/* FR-09.06: validasi sebelum aktif, ditampilkan terus selama menyusun */}
      <section className={problems.length ? "rounded-md border border-amber-600/50 p-4 text-sm" : "rounded-md border border-green-600/50 p-4 text-sm text-green-700"} data-testid="scheme-problems">
        {problems.length ? (
          <>
            <p className="font-semibold text-amber-800">{problems.length} hal harus dibereskan sebelum skema bisa diaktifkan:</p>
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Skema lolos validasi: bobot tiap induk 100%, tanpa siklus, semua variabel ada, satu node indeks.</p>
        )}
      </section>

      {LEVELS.map((level) => {
        const list = nodes.filter((n) => n.level === level);
        if (list.length === 0) return null;
        return (
          <section key={level} className="space-y-3">
            <h2 className="font-semibold">{LEVEL_LABEL[level]}</h2>
            {list.map((n) => {
              const kids = edges.filter((e) => e.parentId === n.id);
              const total = kids.reduce((s, e) => s + e.weight, 0);
              const candidates = nodes.filter((c) => c.id !== n.id && !c.isRoot && !kids.some((k) => k.childId === c.id));
              return (
                <div key={n.id} className="space-y-2 rounded-md border p-3 text-sm" data-testid={`node-${n.code}`}>
                  <p>
                    <code>{n.code}</code> · <b>{n.name}</b>
                    {n.formula && <> · rumus <code>{n.formula}</code></>} · {NORMALIZATION_LABEL[n.normalization]}
                    {n.params?.target !== undefined && <> (target {fmt.format(n.params.target)})</>}
                    {n.level !== "INDICATOR" && <> · {AGGREGATION_LABEL[n.aggregation]}</>}
                  </p>
                  {n.level !== "INDICATOR" && (
                    <div className="space-y-1">
                      <ul className="space-y-1">
                        {kids.map((e) => (
                          <li key={e.childId} className="flex items-center gap-2">
                            {byId.get(e.childId)?.name} — {fmt.format(e.weight * 100)}%
                            {editable && (
                              <form action={deleteEdgeAction}>
                                <input type="hidden" name="schemeId" value={scheme.id} />
                                <input type="hidden" name="parentId" value={n.id} />
                                <input type="hidden" name="childId" value={e.childId} />
                                <button type="submit" className="text-xs underline">
                                  lepas
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                      {n.aggregation === "WEIGHTED_SUM" && (
                        <p className={Math.abs(total - 1) < 1e-6 ? "text-green-700" : "text-amber-700"}>Total bobot {fmt.format(total * 100)}%</p>
                      )}
                      {editable && candidates.length > 0 && (
                        <form action={saveEdgeAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="schemeId" value={scheme.id} />
                          <input type="hidden" name="parentId" value={n.id} />
                          <select name="childId" aria-label={`Anak baru untuk ${n.name}`} className={selectClass}>
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {LEVEL_LABEL[c.level]}: {c.name}
                              </option>
                            ))}
                          </select>
                          <Input name="weight" inputMode="decimal" placeholder="Bobot %" aria-label={`Bobot anak baru untuk ${n.name}`} className="w-24" />
                          <Button type="submit" size="sm" variant="outline">
                            Hubungkan
                          </Button>
                        </form>
                      )}
                      {editable &&
                        kids.map((e) => (
                          <form key={e.childId} action={saveEdgeAction} className="inline-flex items-center gap-1 pr-3">
                            <input type="hidden" name="schemeId" value={scheme.id} />
                            <input type="hidden" name="parentId" value={n.id} />
                            <input type="hidden" name="childId" value={e.childId} />
                            <Input name="weight" defaultValue={fmt.format(e.weight * 100)} aria-label={`Bobot ${byId.get(e.childId)?.name} di ${n.name}`} className="h-8 w-20" />
                            <Button type="submit" size="sm" variant="ghost">
                              Simpan
                            </Button>
                          </form>
                        ))}
                    </div>
                  )}
                  {n.level === "INDICATOR" && (overrideRows.get(n.id) ?? []).length > 0 && (
                    <ul>
                      {overrideRows.get(n.id)!.map((o) => (
                        <li key={o.id} className="flex items-center gap-2">
                          Khusus {typeName.get(o.institutionTypeId)}: {o.formula && <>rumus <code>{o.formula}</code></>}{" "}
                          {(o.normalizationParams as { target?: number } | null)?.target !== undefined && <>target {fmt.format((o.normalizationParams as { target: number }).target)}</>}
                          {editable && (
                            <form action={deleteOverrideAction}>
                              <input type="hidden" name="schemeId" value={scheme.id} />
                              <input type="hidden" name="overrideId" value={o.id} />
                              <button type="submit" className="text-xs underline">
                                hapus
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <div className="flex flex-wrap gap-4">
                      <details>
                        <summary className="cursor-pointer underline">Ubah node</summary>
                        <form action={saveNodeAction} className="mt-2 space-y-2 rounded-md border p-3">
                          <input type="hidden" name="schemeId" value={scheme.id} />
                          <input type="hidden" name="nodeId" value={n.id} />
                          {nodeFields(n)}
                          <Button type="submit" size="sm">
                            Simpan node
                          </Button>
                        </form>
                      </details>
                      {n.level === "INDICATOR" && (
                        <details>
                          <summary className="cursor-pointer underline">Khusus jenis peserta</summary>
                          <form action={saveOverrideAction} className="mt-2 grid gap-2 rounded-md border p-3 md:grid-cols-3">
                            <input type="hidden" name="schemeId" value={scheme.id} />
                            <input type="hidden" name="nodeId" value={n.id} />
                            <select name="typeId" aria-label={`Jenis untuk ${n.code}`} className={selectClass}>
                              {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <Input name="formula" placeholder="Rumus khusus (opsional)" aria-label={`Rumus khusus ${n.code}`} className="font-mono" />
                            <Input name="target" inputMode="decimal" placeholder="Target khusus" aria-label={`Target khusus ${n.code}`} />
                            <Button type="submit" size="sm" variant="outline">
                              Simpan khusus jenis
                            </Button>
                          </form>
                        </details>
                      )}
                      {!n.isRoot && (
                        <ConfirmAction
                          action={deleteNodeAction}
                          fields={{ schemeId: scheme.id, nodeId: n.id }}
                          label="Hapus node"
                          confirmLabel={`Ya, hapus ${n.code}`}
                          impact="Node dan semua hubungan bobotnya dihapus dari skema ini."
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {editable && (
        <section className="space-y-2 rounded-md border p-4">
          <h2 className="font-semibold">Tambah node</h2>
          <form action={saveNodeAction} className="space-y-2">
            <input type="hidden" name="schemeId" value={scheme.id} />
            {nodeFields()}
            <Button type="submit">Tambah node</Button>
          </form>
        </section>
      )}

      <section className="space-y-2 rounded-md border p-4">
        <h2 className="font-semibold">Kategori skor</h2>
        <ul className="space-y-1 text-sm">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c.color ?? undefined }} aria-hidden />
              {c.name}: {fmt.format(c.minScore)} – {fmt.format(c.maxScore)}
              {editable && (
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="schemeId" value={scheme.id} />
                  <input type="hidden" name="categoryId" value={c.id} />
                  <button type="submit" className="text-xs underline">
                    hapus
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <form action={saveCategoryAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="schemeId" value={scheme.id} />
            <Input name="name" placeholder="Nama kategori" aria-label="Nama kategori" className="w-48" required />
            <Input name="minScore" placeholder="Min" aria-label="Skor min kategori" className="w-20" required />
            <Input name="maxScore" placeholder="Maks" aria-label="Skor maks kategori" className="w-20" required />
            <input name="color" type="color" defaultValue="#15803d" aria-label="Warna kategori" className="h-9 w-12" />
            <Button type="submit" size="sm" variant="outline">
              Tambah kategori
            </Button>
          </form>
        )}
      </section>

      <RecordHistory
        targets={[
          { table: "scoring_schemes", ids: [scheme.id] },
          { table: "score_nodes", ids: history.nodes.map((n) => n.id) },
          { table: "score_categories", ids: history.categories.map((c) => c.id) },
        ]}
        labels={{ scoring_schemes: "skema", score_nodes: "node", score_categories: "kategori" }}
        returnTo={`/admin/skoring/${scheme.id}`}
        role={user.role}
      />
    </div>
  );
}
