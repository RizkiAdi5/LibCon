"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MONTH_NAMES, type MonthCell } from "@/lib/visitors";
import { saveVisitorReportAction, type VisitorFormState } from "./actions";

const initialState: VisitorFormState = {};
const fmt = new Intl.NumberFormat("id-ID");
const num = (s: string) => {
  const n = Number(s.replace(/\./g, ""));
  return s.trim() && Number.isFinite(n) ? n : 0;
};

export function VisitorForm({ year, open, grid, updatedAt }: { year: number; open: number; grid: MonthCell[]; updatedAt: (string | null)[] }) {
  const [state, formAction, pending] = useActionState(saveVisitorReportAction, initialState);
  const [values, setValues] = useState(() =>
    grid.map((c) => ({ male: c ? String(c.male) : "", female: c ? String(c.female) : "" })),
  );
  const set = (i: number, key: "male" | "female", v: string) =>
    setValues((prev) => prev.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const totals = values.reduce((t, r) => ({ male: t.male + num(r.male), female: t.female + num(r.female) }), { male: 0, female: 0 });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="year" value={year} />
      <div className="box overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Bulan</th>
              <th className="text-right">Laki-laki</th>
              <th className="text-right">Perempuan</th>
              <th className="text-right">Jumlah</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {values.map((row, i) => {
              const month = i + 1;
              const locked = month > open;
              const error = state.errors?.[month];
              return (
                <tr key={month} data-month={month}>
                  <td className="font-medium">{MONTH_NAMES[i]}</td>
                  {(["male", "female"] as const).map((key) => (
                    <td key={key} className="text-right">
                      <Input
                        name={`${key}_${month}`}
                        aria-label={`${key === "male" ? "Laki-laki" : "Perempuan"} ${MONTH_NAMES[i]}`}
                        inputMode="numeric"
                        className="ml-auto w-28 text-right"
                        value={row[key]}
                        onChange={(e) => set(i, key, e.target.value)}
                        disabled={locked}
                        aria-invalid={error ? true : undefined}
                      />
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{row.male || row.female ? fmt.format(num(row.male) + num(row.female)) : "–"}</td>
                  <td className="text-xs">
                    {error ? (
                      <span className="text-destructive">{error}</span>
                    ) : locked ? (
                      <span className="text-muted-foreground">Belum dibuka</span>
                    ) : grid[i] ? (
                      <span className="text-green-700">Tersimpan{updatedAt[i] ? ` · ${updatedAt[i]}` : ""}</span>
                    ) : (
                      <span className="text-amber-700">Belum diisi</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td>Total {year}</td>
              <td className="text-right tabular-nums">{fmt.format(totals.male)}</td>
              <td className="text-right tabular-nums">{fmt.format(totals.female)}</td>
              <td className="text-right tabular-nums">{fmt.format(totals.male + totals.female)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.savedAt && !state.error && (
        <p role="status" className="text-sm text-green-700">
          Rekap {state.savedCount} bulan tersimpan.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan..." : "Simpan rekap"}
      </Button>
    </form>
  );
}
