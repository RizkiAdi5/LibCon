"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmAction } from "@/components/confirm-action";
import { analyzeExpression, COMPARE_OP_LABEL, evaluateRule, type CompareOp, type EngineRule } from "@/lib/validation/engine";
import { RULE_TYPE_LABEL, type RuleInput } from "@/lib/validation/question";
import { deleteRuleAction, saveRuleAction, type RuleFormState } from "../../actions";

type RuleRow = { id: string; ruleType: RuleInput["ruleType"]; severity: "BLOCK" | "FLAG"; message: string; params: Record<string, unknown> };
type QuestionRef = { id: string; code: string; label: string; type: string };

const NUMERIC = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENT", "SCALE"];
const EMPTY: RuleInput = { ruleType: "REQUIRED", severity: "BLOCK", message: "", params: {} };
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const parseFor = (type: string, raw: string): unknown => (NUMERIC.includes(type) ? num(raw) : raw);

function summary(r: RuleRow, others: QuestionRef[]): string {
  const p = r.params;
  switch (r.ruleType) {
    case "RANGE":
      return `${p.min ?? "…"} – ${p.max ?? "…"}`;
    case "COMPARE":
      return `${COMPARE_OP_LABEL[p.op as CompareOp]} ${others.find((o) => o.id === p.other_question_id)?.code ?? "?"}`;
    case "FORMAT":
      return `pola ${p.pattern}`;
    case "YOY_CHANGE":
      return `maks. ±${p.max_pct}%`;
    case "EXPRESSION":
      return String(p.expr);
    default:
      return "";
  }
}

export function RulesPanel({
  periodId,
  question,
  rules,
  otherQuestions,
  institutionTypeCodes,
  published,
}: {
  periodId: string;
  question: QuestionRef;
  rules: RuleRow[];
  otherQuestions: QuestionRef[];
  institutionTypeCodes: string[];
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRuleAction, {} as RuleFormState);
  const [editingId, setEditingId] = useState<string>();
  const [r, setR] = useState<RuleInput>(EMPTY);
  const [test, setTest] = useState<Record<string, string>>({});
  const setParams = (patch: Partial<RuleInput["params"]>) => setR((prev) => ({ ...prev, params: { ...prev.params, ...patch } }));
  const err = (path: string) => state.fieldErrors?.[path];

  // setelah tersimpan: kosongkan form (daftar aturan sudah diperbarui dari server)
  const [seenSavedAt, setSeenSavedAt] = useState<number>();
  if (state.savedAt && state.savedAt !== seenSavedAt) {
    setSeenSavedAt(state.savedAt);
    setEditingId(undefined);
    setR(EMPTY);
  }

  const allQuestions = [question, ...otherQuestions];
  const numericOthers = otherQuestions.filter((o) => NUMERIC.includes(o.type));
  const exprVars = r.ruleType === "EXPRESSION" ? analyzeExpression(r.params.expr ?? "", [...allQuestions.map((q) => q.code), "jenis"]) : null;

  // FR-06.06: contoh nilai lolos/gagal — dinilai dengan mesin yang sama dengan pengisian peserta
  const testVars = [question.code, ...(r.ruleType === "COMPARE" ? [otherQuestions.find((o) => o.id === r.params.other_question_id)?.code] : []), ...(exprVars?.variables ?? [])]
    .filter((v, i, a): v is string => !!v && a.indexOf(v) === i);
  const answers: Record<string, unknown> = {};
  for (const q of allQuestions) if (test[q.code] !== undefined) answers[q.id] = parseFor(q.type, test[q.code]);
  const result = evaluateRule({ id: "test", questionId: question.id, ...r, params: r.params as Record<string, unknown> } as EngineRule, {
    value: answers[question.id],
    answers,
    visible: new Set(allQuestions.map((q) => q.id)),
    codeToId: new Map(allQuestions.map((q) => [q.code, q.id])),
    institutionTypeCode: test.jenis || null,
    previousValue: num(test.__previous ?? ""),
  });

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <h2 className="font-semibold">Aturan validasi</h2>
      {rules.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aturan.</p>}
      <ul className="space-y-2 text-sm">
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2">
            <div>
              <span className={rule.severity === "BLOCK" ? "font-medium text-destructive" : "font-medium text-amber-700"}>
                {rule.severity === "BLOCK" ? "Blokir" : "Flag"}
              </span>{" "}
              · {RULE_TYPE_LABEL[rule.ruleType]} {summary(rule, otherQuestions)}
              <p className="text-muted-foreground">Pesan: {rule.message}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setEditingId(rule.id);
                  setR({ ruleType: rule.ruleType, severity: rule.severity, message: rule.message, params: rule.params as RuleInput["params"] });
                }}
              >
                {published ? "Ubah pesan" : "Ubah"}
              </button>
              {!published && (
                <ConfirmAction
                  action={deleteRuleAction}
                  fields={{ periodId, questionId: question.id, ruleId: rule.id }}
                  label="Hapus"
                  confirmLabel="Ya, hapus aturan"
                  impact="Aturan ini tidak lagi diperiksa saat peserta mengisi."
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {(!published || editingId) && (
        <form action={formAction} className="box space-y-3 p-4">
          <input type="hidden" name="periodId" value={periodId} />
          <input type="hidden" name="questionId" value={question.id} />
          {editingId && <input type="hidden" name="ruleId" value={editingId} />}
          <input type="hidden" name="payload" value={JSON.stringify(r)} />
          <h3 className="text-sm font-medium">{editingId ? "Ubah aturan" : "Tambah aturan"}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ruleType">Jenis aturan</Label>
              <select
                id="ruleType"
                className="h-9 w-full rounded-md border px-2 text-sm"
                disabled={published}
                value={r.ruleType}
                onChange={(e) => setR({ ...r, ruleType: e.target.value as RuleInput["ruleType"], params: {} })}
              >
                {Object.entries(RULE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {err("ruleType") && <p className="text-sm text-destructive">{err("ruleType")}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="severity">Tingkat</Label>
              <select
                id="severity"
                className="h-9 w-full rounded-md border px-2 text-sm"
                disabled={published}
                value={r.severity}
                onChange={(e) => setR({ ...r, severity: e.target.value as RuleInput["severity"] })}
              >
                <option value="BLOCK">Blokir — peserta tidak bisa mengirim</option>
                <option value="FLAG">Flag — boleh mengirim, ditandai untuk admin</option>
              </select>
            </div>

            {r.ruleType === "RANGE" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rmin">Min.</Label>
                  <Input id="rmin" type="number" step="any" disabled={published} value={r.params.min ?? ""} onChange={(e) => setParams({ min: num(e.target.value) })} />
                  {err("params.min") && <p className="text-sm text-destructive">{err("params.min")}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rmax">Maks.</Label>
                  <Input id="rmax" type="number" step="any" disabled={published} value={r.params.max ?? ""} onChange={(e) => setParams({ max: num(e.target.value) })} />
                  {err("params.max") && <p className="text-sm text-destructive">{err("params.max")}</p>}
                </div>
              </>
            )}
            {r.ruleType === "COMPARE" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="op">Nilai soal ini harus</Label>
                  <select id="op" className="h-9 w-full rounded-md border px-2 text-sm" disabled={published} value={r.params.op ?? ""} onChange={(e) => setParams({ op: e.target.value as CompareOp })}>
                    <option value="">— Operator —</option>
                    {Object.entries(COMPARE_OP_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {err("params.op") && <p className="text-sm text-destructive">{err("params.op")}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="other">Soal pembanding</Label>
                  <select id="other" className="h-9 w-full rounded-md border px-2 text-sm" disabled={published} value={r.params.other_question_id ?? ""} onChange={(e) => setParams({ other_question_id: e.target.value })}>
                    <option value="">— Pilih soal angka —</option>
                    {numericOthers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code} — {o.label}
                      </option>
                    ))}
                  </select>
                  {err("params.other_question_id") && <p className="text-sm text-destructive">{err("params.other_question_id")}</p>}
                </div>
              </>
            )}
            {r.ruleType === "FORMAT" && (
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="pattern">Pola teks (regex), mis. drive\.google\.com atau ^[0-9]+$</Label>
                <Input id="pattern" className="font-mono" disabled={published} value={r.params.pattern ?? ""} onChange={(e) => setParams({ pattern: e.target.value })} />
                {err("params.pattern") && <p className="text-sm text-destructive">{err("params.pattern")}</p>}
              </div>
            )}
            {r.ruleType === "YOY_CHANGE" && (
              <div className="space-y-1">
                <Label htmlFor="maxpct">Flag jika naik/turun lebih dari (%)</Label>
                <Input id="maxpct" type="number" step="any" disabled={published} value={r.params.max_pct ?? ""} onChange={(e) => setParams({ max_pct: num(e.target.value) })} />
                {err("params.max_pct") && <p className="text-sm text-destructive">{err("params.max_pct")}</p>}
              </div>
            )}
            {r.ruleType === "EXPRESSION" && (
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="expr">Ekspresi (kode soal, jenis, and/or/not, + − × ÷, abs/min/max/round)</Label>
                <Input id="expr" className="font-mono" disabled={published} value={r.params.expr ?? ""} onChange={(e) => setParams({ expr: e.target.value })} placeholder="j_siswa > 0 OR jenis != 'SD'" />
                {(err("params.expr") || exprVars?.error) && <p className="text-sm text-destructive">{err("params.expr") ?? exprVars?.error}</p>}
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="message">Pesan untuk peserta</Label>
              <textarea id="message" className="min-h-12 w-full rounded-md border p-2 text-sm" value={r.message} onChange={(e) => setR({ ...r, message: e.target.value })} />
              {err("message") && <p className="text-sm text-destructive">{err("message")}</p>}
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <legend className="px-1 font-medium">Uji aturan</legend>
            <div className="flex flex-wrap gap-3">
              {testVars.map((code) => (
                <div key={code} className="space-y-1">
                  <Label htmlFor={`test-${code}`}>Nilai {code}</Label>
                  <Input id={`test-${code}`} className="w-40" value={test[code] ?? ""} onChange={(e) => setTest({ ...test, [code]: e.target.value })} />
                </div>
              ))}
              {r.ruleType === "YOY_CHANGE" && (
                <div className="space-y-1">
                  <Label htmlFor="test-prev">Nilai tahun lalu</Label>
                  <Input id="test-prev" className="w-40" value={test.__previous ?? ""} onChange={(e) => setTest({ ...test, __previous: e.target.value })} />
                </div>
              )}
              {exprVars?.variables.includes("jenis") && (
                <div className="space-y-1">
                  <Label htmlFor="test-jenis">Jenis</Label>
                  <select id="test-jenis" className="h-9 rounded-md border px-2" value={test.jenis ?? ""} onChange={(e) => setTest({ ...test, jenis: e.target.value })}>
                    <option value="">—</option>
                    {institutionTypeCodes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p aria-live="polite" data-testid="rule-test-result">
              Hasil:{" "}
              {result === true ? (
                <span className="text-green-700">Lolos</span>
              ) : result === false ? (
                <span className="text-destructive">Gagal — “{r.message || "(pesan belum diisi)"}”</span>
              ) : (
                <span className="text-muted-foreground">Tidak bisa dinilai (nilai kosong atau pembanding belum diisi)</span>
              )}
            </p>
          </fieldset>

          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : editingId ? "Simpan aturan" : "Tambah aturan"}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={() => (setEditingId(undefined), setR(EMPTY))}>
                Batal
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
