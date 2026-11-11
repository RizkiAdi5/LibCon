"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { SurveyQuestion } from "@/lib/surveyDefinition";
import { parseIdNumber } from "@/lib/answers";

type Row = Record<string, string>;


/** FR-07.07: angka & rupiah tampil dengan pemisah ribuan titik; saat diketik tampil apa adanya. */
function NumberField({
  value,
  onChange,
  decimals,
  ...rest
}: { value: number | null; onChange: (v: number | null) => void; decimals: boolean } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals ? 4 : 0 }).format(value));
  return (
    <Input
      {...rest}
      inputMode={decimals ? "decimal" : "numeric"}
      className="w-48"
      value={shown}
      onFocus={() => setDraft(value === null || value === undefined ? "" : String(value).replace(".", ","))}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseIdNumber(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Input jawaban per tipe soal (PRD §5.5). Nilai: angka untuk tipe angka, string, string[] (pilihan ganda), Row[] (tabel). */
export function AnswerInput({
  question: q,
  value,
  onChange,
  describedBy,
  disabled,
}: {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  describedBy?: string;
  disabled?: boolean;
}) {
  const common = { id: `q-${q.id}`, "aria-describedby": describedBy, disabled };
  const c = q.config;

  switch (q.type) {
    case "INTEGER":
    case "DECIMAL":
    case "CURRENCY":
    case "PERCENT":
      return (
        <div className="flex items-center gap-2">
          {q.type === "CURRENCY" && <span className="text-sm">Rp</span>}
          <NumberField {...common} decimals={q.type === "DECIMAL" || q.type === "PERCENT"} value={(value as number | null) ?? null} onChange={onChange} />
          {q.type === "PERCENT" && <span className="text-sm">%</span>}
          {c.unit && <span className="text-sm text-muted-foreground">{c.unit}</span>}
        </div>
      );
    case "SHORT_TEXT":
      return <Input {...common} maxLength={c.maxLength ?? undefined} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "LONG_TEXT":
      return <textarea {...common} className="min-h-20 w-full rounded-md border p-2 text-sm" maxLength={c.maxLength ?? undefined} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "DATE":
      return <Input {...common} type="date" className="w-48" min={c.minDate} max={c.maxDate} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "URL":
      return <Input {...common} type="url" placeholder="https://" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "DROPDOWN":
      return (
        <select {...common} className="h-9 w-full max-w-md rounded-md border px-2 text-sm" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">— Pilih —</option>
          {q.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "SINGLE_CHOICE":
    case "YES_NO":
    case "SCALE": {
      const options = q.type === "SCALE" ? [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })) : q.options;
      return (
        <div role="radiogroup" aria-labelledby={`label-${q.id}`} aria-describedby={describedBy} className="flex flex-wrap items-center gap-4 text-sm">
          {q.type === "SCALE" && c.minLabel && <span className="text-muted-foreground">{c.minLabel}</span>}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-1">
              <input type="radio" name={`q-${q.id}`} disabled={disabled} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
          {q.type === "SCALE" && c.maxLabel && <span className="text-muted-foreground">{c.maxLabel}</span>}
        </div>
      );
    }
    case "MULTI_CHOICE": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div role="group" aria-labelledby={`label-${q.id}`} aria-describedby={describedBy} className="flex flex-wrap gap-4 text-sm">
          {q.options.map((o) => (
            <label key={o.value} className="flex items-center gap-1">
              <input
                type="checkbox"
                disabled={disabled}
                checked={picked.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...picked, o.value] : picked.filter((v) => v !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "TABLE": {
      const rows = Array.isArray(value) ? (value as Row[]) : [];
      const columns = c.columns ?? [];
      const setRow = (i: number, key: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
      return (
        <div className="space-y-2" aria-describedby={describedBy}>
          <table className="text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.label} className="pr-2 text-left font-normal text-muted-foreground">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.label} className="pr-2 pb-1">
                      <Input
                        aria-label={`${col.label} baris ${i + 1}`}
                        disabled={disabled}
                        type={col.type === "DATE" ? "date" : col.type === "TEXT" ? "text" : "number"}
                        value={row[col.label] ?? ""}
                        onChange={(e) => setRow(i, col.label, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    {!disabled && (
                      <button type="button" className="text-sm underline" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                        Hapus baris
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && (
            <button type="button" className="text-sm underline" onClick={() => onChange([...rows, {}])}>
              + Tambah baris
            </button>
          )}
        </div>
      );
    }
    default:
      return <p className="text-sm text-muted-foreground">Tipe {q.type} belum didukung.</p>;
  }
}
