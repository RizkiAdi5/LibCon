import { describe, expect, it } from "vitest";
import { parseWibDateTime, toWibInputValue } from "@/lib/date";
import { effectiveClosesAt, nextAutoStatus } from "@/lib/period";
import { extensionSchema, periodSchema } from "@/lib/validation/period";

const d = (iso: string) => new Date(iso);

describe("parseWibDateTime / toWibInputValue", () => {
  it("30 Juni 23:59 WIB = 30 Juni 16:59 UTC (AC M02)", () => {
    expect(parseWibDateTime("2026-06-30T23:59")).toEqual(d("2026-06-30T16:59:00Z"));
  });

  it("bolak-balik konsisten dan menolak format salah", () => {
    expect(toWibInputValue(d("2026-06-30T16:59:00Z"))).toBe("2026-06-30T23:59");
    expect(parseWibDateTime("30/06/2026")).toBeNull();
    expect(parseWibDateTime("")).toBeNull();
  });
});

describe("effectiveClosesAt [FR-02.07, BR-12]", () => {
  const closes = d("2026-06-30T16:59:00Z");
  const all = { institutionId: null, newClosesAt: d("2026-07-05T16:59:00Z") };
  const one = { institutionId: "inst-a", newClosesAt: d("2026-07-10T16:59:00Z") };

  it("tanpa perpanjangan = tanggal tutup periode", () => {
    expect(effectiveClosesAt(closes, [], "inst-a")).toEqual(closes);
  });

  it("lembaga terpilih mendapat perpanjangan khususnya, lembaga lain hanya yang umum", () => {
    expect(effectiveClosesAt(closes, [all, one], "inst-a")).toEqual(one.newClosesAt);
    expect(effectiveClosesAt(closes, [all, one], "inst-b")).toEqual(all.newClosesAt);
  });

  it("perpanjangan yang dihapus (soft delete) diabaikan", () => {
    expect(effectiveClosesAt(closes, [{ ...all, deletedAt: d("2026-06-01T00:00:00Z") }], "inst-b")).toEqual(closes);
  });
});

describe("nextAutoStatus [FR-02.04, FR-02.05]", () => {
  const period = { opensAt: d("2026-06-01T00:00:00Z"), closesAt: d("2026-06-30T16:59:00Z") };

  it("DRAFT dibuka saat tanggal buka tercapai, kecuali ada periode lain OPEN", () => {
    const now = d("2026-06-01T00:00:00Z");
    expect(nextAutoStatus({ ...period, status: "DRAFT" }, [], now, false)).toBe("OPEN");
    expect(nextAutoStatus({ ...period, status: "DRAFT" }, [], now, true)).toBeNull();
    expect(nextAutoStatus({ ...period, status: "DRAFT" }, [], d("2026-05-31T23:59:00Z"), false)).toBeNull();
  });

  it("DRAFT yang tanggal tutupnya sudah lewat tidak dibuka", () => {
    expect(nextAutoStatus({ ...period, status: "DRAFT" }, [], d("2026-07-01T00:00:00Z"), false)).toBeNull();
  });

  it("OPEN ditutup saat 30 Juni 23:59 WIB lewat (AC M02)", () => {
    expect(nextAutoStatus({ ...period, status: "OPEN" }, [], d("2026-06-30T16:58:59Z"), false)).toBeNull();
    expect(nextAutoStatus({ ...period, status: "OPEN" }, [], d("2026-06-30T16:59:00Z"), false)).toBe("CLOSED");
  });

  it("perpanjangan semua lembaga menahan OPEN; perpanjangan khusus lembaga tidak", () => {
    const now = d("2026-07-01T00:00:00Z");
    const all = { institutionId: null, newClosesAt: d("2026-07-05T00:00:00Z") };
    const one = { institutionId: "inst-a", newClosesAt: d("2026-07-05T00:00:00Z") };
    expect(nextAutoStatus({ ...period, status: "OPEN" }, [all], now, false)).toBeNull();
    expect(nextAutoStatus({ ...period, status: "OPEN" }, [one], now, false)).toBe("CLOSED");
  });

  it("CLOSED/ARCHIVED tidak berubah otomatis", () => {
    expect(nextAutoStatus({ ...period, status: "CLOSED" }, [], d("2026-06-15T00:00:00Z"), false)).toBeNull();
    expect(nextAutoStatus({ ...period, status: "ARCHIVED" }, [], d("2026-06-15T00:00:00Z"), false)).toBeNull();
  });
});

describe("periodSchema [FR-02.03, FR-02.08]", () => {
  const valid = {
    name: "Lomba Perpustakaan 2026",
    year: "2026",
    opensAt: "2026-06-01T08:00",
    closesAt: "2026-06-30T23:59",
    revisionDeadlineDays: "7",
    revisionScope: "SELECTED_QUESTIONS",
    passingScore: "70",
  };

  it("menerima data valid; checkbox ranking kosong = false", () => {
    const r = periodSchema.safeParse(valid);
    expect(r.success && r.data.showRankingToParticipants).toBe(false);
    expect(r.success && r.data.passingScore).toBe(70);
  });

  it("tanggal tutup harus setelah tanggal buka", () => {
    const r = periodSchema.safeParse({ ...valid, closesAt: "2026-06-01T08:00" });
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toContain("Tanggal tutup harus setelah tanggal buka");
  });

  it("tanggal wajib, batas revisi minimal 1 hari", () => {
    expect(periodSchema.safeParse({ ...valid, opensAt: "" }).success).toBe(false);
    expect(periodSchema.safeParse({ ...valid, revisionDeadlineDays: "0" }).success).toBe(false);
  });
});

describe("extensionSchema [FR-02.07]", () => {
  const base = { newClosesAt: "2026-07-05T23:59", reason: "Banjir", scope: "ALL", institutionIds: [] };

  it("alasan wajib", () => {
    expect(extensionSchema.safeParse({ ...base, reason: " " }).success).toBe(false);
  });

  it("lembaga terpilih wajib minimal satu", () => {
    expect(extensionSchema.safeParse({ ...base, scope: "SELECTED" }).success).toBe(false);
    expect(extensionSchema.safeParse(base).success).toBe(true);
  });
});
