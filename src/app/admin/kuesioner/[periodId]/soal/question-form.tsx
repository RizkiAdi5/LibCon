"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUILDER_QUESTION_TYPES,
  CHOICE_TYPES,
  QUESTION_TYPE_LABEL,
  slugifyCode,
  uniqueCode,
  type BuilderQuestionType,
  type QuestionConfig,
  type TableColumn,
} from "@/lib/questionnaire";
import { saveQuestionAction, type QuestionFormState } from "../../actions";

export type QuestionDraft = {
  sectionId: string;
  label: string;
  code: string;
  helpText: string;
  type: BuilderQuestionType;
  isRequired: boolean;
  hasEvidenceUrl: boolean;
  institutionTypeIds: string[];
  options: { label: string; scoreValue: number | null }[];
  config: QuestionConfig;
};

const YES_NO_OPTIONS = [
  { label: "Ya", scoreValue: null },
  { label: "Tidak", scoreValue: null },
];
const initialState: QuestionFormState = {};
const selectClass = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function QuestionForm({
  periodId,
  questionId,
  sections,
  institutionTypes,
  takenCodes,
  initial,
  published,
}: {
  periodId: string;
  questionId?: string;
  sections: { id: string; title: string }[];
  institutionTypes: { id: string; name: string }[];
  takenCodes: string[];
  initial: QuestionDraft;
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveQuestionAction, initialState);
  const [q, setQ] = useState(initial);
  const [codeTouched, setCodeTouched] = useState(Boolean(questionId));
  const set = (patch: Partial<QuestionDraft>) => setQ((prev) => ({ ...prev, ...patch }));
  const setConfig = (patch: Partial<QuestionConfig>) => setQ((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
  const locked = published; // FR-06.10: struktur terkunci, hanya teks bantuan
  const err = (path: string) => state.fieldErrors?.[path];

  function field(path: string, label: string, input: ReactNode) {
    return (
      <div className="space-y-1">
        <Label htmlFor={path}>{label}</Label>
        {input}
        {err(path) && <p className="text-sm text-destructive">{err(path)}</p>}
      </div>
    );
  }
  const numberInput = (key: keyof QuestionConfig, label: string, step = "any") =>
    field(
      `config.${key}`,
      label,
      <Input
        id={`config.${key}`}
        type="number"
        step={step}
        disabled={locked}
        value={(q.config[key] as number | null | undefined) ?? ""}
        onChange={(e) => setConfig({ [key]: num(e.target.value) })}
      />,
    );
  const textInput = (key: keyof QuestionConfig, label: string) =>
    field(
      `config.${key}`,
      label,
      <Input id={`config.${key}`} disabled={locked} value={(q.config[key] as string | undefined) ?? ""} onChange={(e) => setConfig({ [key]: e.target.value })} />,
    );

  function changeType(type: BuilderQuestionType) {
    const wasChoice = CHOICE_TYPES.includes(q.type);
    const options = type === "YES_NO" ? YES_NO_OPTIONS : CHOICE_TYPES.includes(type) ? (wasChoice && q.type !== "YES_NO" ? q.options : []) : [];
    set({ type, options });
  }

  const columns = q.config.columns ?? [];
  const setColumns = (next: TableColumn[]) => setConfig({ columns: next });

  return (
    <form action={formAction} className="max-w-3xl space-y-4">
      <input type="hidden" name="periodId" value={periodId} />
      {questionId && <input type="hidden" name="questionId" value={questionId} />}
      <input type="hidden" name="payload" value={JSON.stringify(q)} />
      {locked && <p className="text-sm text-amber-700">Kuesioner sudah terbit: struktur soal terkunci, hanya teks bantuan yang bisa diubah.</p>}

      {field(
        "sectionId",
        "Bagian",
        <select id="sectionId" className={selectClass} disabled={locked} value={q.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>,
      )}
      {field(
        "label",
        "Teks soal",
        <textarea
          id="label"
          className="min-h-16 w-full rounded-md border p-2 text-sm"
          disabled={locked}
          value={q.label}
          onChange={(e) => set({ label: e.target.value, ...(codeTouched ? {} : { code: uniqueCode(slugifyCode(e.target.value), takenCodes) }) })}
        />,
      )}
      {field(
        "code",
        "Kode variabel (dipakai di aturan & rumus, terkunci setelah terbit)",
        <Input
          id="code"
          className="font-mono"
          disabled={locked}
          value={q.code}
          onChange={(e) => {
            setCodeTouched(true);
            set({ code: e.target.value });
          }}
        />,
      )}
      {field(
        "helpText",
        "Teks bantuan",
        <textarea id="helpText" className="min-h-12 w-full rounded-md border p-2 text-sm" value={q.helpText} onChange={(e) => set({ helpText: e.target.value })} />,
      )}
      {field(
        "type",
        "Tipe jawaban",
        <select id="type" className={selectClass} disabled={locked} value={q.type} onChange={(e) => changeType(e.target.value as BuilderQuestionType)}>
          {BUILDER_QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABEL[t]}
            </option>
          ))}
        </select>,
      )}

      <fieldset className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
        <legend className="px-1 text-sm">Pengaturan {QUESTION_TYPE_LABEL[q.type]}</legend>
        {q.type === "INTEGER" && (
          <>
            {numberInput("min", "Min.", "1")}
            {numberInput("max", "Maks.", "1")}
            {textInput("unit", "Satuan")}
          </>
        )}
        {q.type === "DECIMAL" && (
          <>
            {numberInput("decimals", "Jumlah desimal", "1")}
            {numberInput("min", "Min.")}
            {numberInput("max", "Maks.")}
            {textInput("unit", "Satuan")}
          </>
        )}
        {q.type === "CURRENCY" && numberInput("min", "Min. (Rp)", "1")}
        {q.type === "PERCENT" && <p className="text-sm text-muted-foreground">Nilai 0–100.</p>}
        {(q.type === "SHORT_TEXT" || q.type === "LONG_TEXT") && numberInput("maxLength", "Panjang maks. (karakter)", "1")}
        {q.type === "MULTI_CHOICE" && (
          <>
            {numberInput("minSelect", "Min. pilihan", "1")}
            {numberInput("maxSelect", "Maks. pilihan", "1")}
          </>
        )}
        {q.type === "DATE" && (
          <>
            {field("config.minDate", "Tanggal awal", <Input id="config.minDate" type="date" disabled={locked} value={q.config.minDate ?? ""} onChange={(e) => setConfig({ minDate: e.target.value })} />)}
            {field("config.maxDate", "Tanggal akhir", <Input id="config.maxDate" type="date" disabled={locked} value={q.config.maxDate ?? ""} onChange={(e) => setConfig({ maxDate: e.target.value })} />)}
          </>
        )}
        {q.type === "SCALE" && (
          <>
            {textInput("minLabel", "Label nilai 1")}
            {textInput("maxLabel", "Label nilai 5")}
          </>
        )}
        {q.type === "URL" &&
          field(
            "config.allowedDomains",
            "Domain yang diizinkan (pisahkan koma, mis. drive.google.com)",
            <Input
              id="config.allowedDomains"
              disabled={locked}
              value={(q.config.allowedDomains ?? []).join(", ")}
              onChange={(e) => setConfig({ allowedDomains: e.target.value.split(",").map((d) => d.trim()).filter(Boolean) })}
            />,
          )}
        {q.type === "TABLE" && (
          <>
            {numberInput("minRows", "Min. baris", "1")}
            {numberInput("maxRows", "Maks. baris", "1")}
            <div className="space-y-2 md:col-span-3">
              <p className="text-sm">Kolom tabel</p>
              {columns.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label={`Nama kolom ${i + 1}`}
                    disabled={locked}
                    value={c.label}
                    onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <select
                    aria-label={`Tipe kolom ${i + 1}`}
                    className="h-9 rounded-md border px-2 text-sm"
                    disabled={locked}
                    value={c.type}
                    onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, type: e.target.value as TableColumn["type"] } : x)))}
                  >
                    <option value="TEXT">Teks</option>
                    <option value="INTEGER">Angka bulat</option>
                    <option value="DECIMAL">Desimal</option>
                    <option value="DATE">Tanggal</option>
                  </select>
                  {!locked && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
                      Hapus
                    </Button>
                  )}
                </div>
              ))}
              {err("config.columns") && <p className="text-sm text-destructive">{err("config.columns")}</p>}
              {!locked && (
                <Button type="button" variant="outline" size="sm" onClick={() => setColumns([...columns, { label: "", type: "TEXT" }])}>
                  + Kolom
                </Button>
              )}
            </div>
          </>
        )}
        {CHOICE_TYPES.includes(q.type) && (
          <div className="space-y-2 md:col-span-3">
            <p className="text-sm">Opsi jawaban + nilai skor (FR-06.07)</p>
            {q.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Teks opsi ${i + 1}`}
                  disabled={locked || q.type === "YES_NO"}
                  value={o.label}
                  onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                />
                <Input
                  aria-label={`Skor opsi ${o.label || i + 1}`}
                  type="number"
                  step="any"
                  className="w-28"
                  placeholder="Skor"
                  disabled={locked}
                  value={o.scoreValue ?? ""}
                  onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? { ...x, scoreValue: num(e.target.value) } : x)) })}
                />
                {!locked && q.type !== "YES_NO" && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}>
                    Hapus
                  </Button>
                )}
              </div>
            ))}
            {err("options") && <p className="text-sm text-destructive">{err("options")}</p>}
            {!locked && q.type !== "YES_NO" && (
              <Button type="button" variant="outline" size="sm" onClick={() => set({ options: [...q.options, { label: "", scoreValue: null }] })}>
                + Opsi
              </Button>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-1 text-sm">
        <legend>Berlaku untuk jenis (kosong = semua jenis)</legend>
        {institutionTypes.map((t) => (
          <label key={t.id} className="mr-4 inline-flex items-center gap-1">
            <input
              type="checkbox"
              disabled={locked}
              checked={q.institutionTypeIds.includes(t.id)}
              onChange={(e) =>
                set({ institutionTypeIds: e.target.checked ? [...q.institutionTypeIds, t.id] : q.institutionTypeIds.filter((x) => x !== t.id) })
              }
            />
            {t.name}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={locked} checked={q.isRequired} onChange={(e) => set({ isRequired: e.target.checked })} />
        Wajib diisi
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={locked} checked={q.hasEvidenceUrl} onChange={(e) => set({ hasEvidenceUrl: e.target.checked })} />
        Minta link bukti dukung (Google Drive) untuk soal ini
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan..." : locked ? "Simpan teks bantuan" : "Simpan soal"}
      </Button>
    </form>
  );
}
