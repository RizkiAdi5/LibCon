import { describe, expect, it } from "vitest";
import { fillStatus, gridTotals, lastClosedMonth, monthGrid, openMonths, parseVisitorForm } from "./visitors";

// 2026-03-31 20.00 UTC = 1 April 2026 03.00 WIB
const now = new Date("2026-03-31T20:00:00Z");
const form = (values: Record<string, string>) => (name: string) => values[name];

describe("rekap pengunjung bulanan", () => {
  it("bulan dibuka mengikuti tanggal WIB, termasuk bulan berjalan", () => {
    expect(openMonths(2026, now)).toBe(4);
    expect(openMonths(2025, now)).toBe(12);
    expect(openMonths(2027, now)).toBe(0);
    expect(lastClosedMonth(now)).toEqual({ year: 2026, month: 3 });
    expect(lastClosedMonth(new Date("2026-01-15T00:00:00Z"))).toEqual({ year: 2025, month: 12 });
  });

  it("membaca isian, melewati bulan kosong, menerima pemisah ribuan", () => {
    const r = parseVisitorForm(form({ male_1: "1.250", female_1: "0", male_2: "", female_2: "" }), 2026, now);
    expect(r).toEqual({ ok: true, entries: [{ month: 1, male: 1250, female: 0 }] });
  });

  it("menolak isian setengah, bukan angka, terlalu besar, dan bulan yang belum dibuka", () => {
    const r = parseVisitorForm(
      form({ male_1: "10", male_2: "-3", female_2: "4", male_3: "100001", female_3: "1", male_5: "1", female_5: "1" }),
      2026,
      now,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).map(Number)).toEqual([1, 2, 3, 5]);
    expect(r.errors[5]).toMatch(/belum bisa diisi/);
  });

  it("status & total per lembaga", () => {
    const grid = monthGrid([
      { month: 1, male: 10, female: 5 },
      { month: 3, male: 1, female: 2 },
    ]);
    expect(gridTotals(grid)).toEqual({ male: 11, female: 7, total: 18, filled: 2 });
    expect(fillStatus(grid, 3)).toBe("PARTIAL");
    expect(fillStatus(grid, 1)).toBe("COMPLETE");
    expect(fillStatus(monthGrid([]), 3)).toBe("EMPTY");
  });
});
