"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";

/** FR-09.03: kotak rumus + daftar kode variabel/fungsi yang bisa diklik untuk disisipkan di posisi kursor. */
export function FormulaInput({
  id,
  name,
  defaultValue,
  variables,
  label,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  variables: { code: string; label: string }[];
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, start) + token + el.value.slice(el.selectionEnd ?? start);
    el.focus();
    el.setSelectionRange(start + token.length, start + token.length);
  };
  return (
    <div className="space-y-1">
      <Input ref={ref} id={id} name={name} defaultValue={defaultValue} aria-label={label} className="font-mono" placeholder="j_eksemplar / j_siswa" list={`${id}-vars`} />
      <datalist id={`${id}-vars`}>
        {variables.map((v) => (
          <option key={v.code} value={v.code}>
            {v.label}
          </option>
        ))}
      </datalist>
      <div className="flex flex-wrap gap-1 text-xs">
        {["MIN(", "MAX(", "IF(", "SUM(", "AVG(", "ROUND("].map((f) => (
          <button key={f} type="button" className="rounded border px-1 font-mono" onClick={() => insert(f)}>
            {f}
          </button>
        ))}
        {variables.map((v) => (
          <button key={v.code} type="button" title={v.label} className="rounded border bg-muted px-1 font-mono" onClick={() => insert(v.code)}>
            {v.code}
          </button>
        ))}
      </div>
    </div>
  );
}
