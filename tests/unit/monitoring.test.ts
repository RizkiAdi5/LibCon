import { describe, expect, it } from "vitest";
import { csvCell, monitoringStatus, reminderDueToday, stackCounts, startOfWibDay, wibDate } from "@/lib/monitoring";

describe("tanggal WIB", () => {
  it("23.30 WIB masih tanggal yang sama, 00.30 WIB sudah besok", () => {
    expect(wibDate(new Date("2026-06-27T16:30:00Z"))).toBe("2026-06-27");
    expect(wibDate(new Date("2026-06-27T17:30:00Z"))).toBe("2026-06-28");
    expect(startOfWibDay(new Date("2026-06-27T05:00:00Z"))).toEqual(new Date("2026-06-26T17:00:00Z"));
  });
});

describe("reminderDueToday [FR-10.05, AC M10]", () => {
  const closes = new Date("2026-06-30T16:59:00Z"); // 30 Juni 23.59 WIB
  it("AC: tenggat 30 Juni, jadwal H-3 → jatuh pada cron 27 Juni 07.00 WIB", () => {
    expect(reminderDueToday("DEADLINE", 3, closes, new Date("2026-06-27T00:00:00Z"))).toBe(true);
    expect(reminderDueToday("DEADLINE", 3, closes, new Date("2026-06-28T00:00:00Z"))).toBe(false);
    expect(reminderDueToday("DEADLINE", 7, closes, new Date("2026-06-23T00:00:00Z"))).toBe(true);
  });

  it("revisi H-1 dan aktivasi n hari setelah akun dibuat", () => {
    expect(reminderDueToday("REVISION", 1, new Date("2026-07-10T10:00:00Z"), new Date("2026-07-09T00:00:00Z"))).toBe(true);
    expect(reminderDueToday("ACTIVATION", 3, new Date("2026-06-01T03:00:00Z"), new Date("2026-06-04T00:00:00Z"))).toBe(true);
    expect(reminderDueToday("ACTIVATION", 3, new Date("2026-06-01T03:00:00Z"), new Date("2026-06-05T00:00:00Z"))).toBe(false);
  });
});

describe("monitoringStatus [FR-10.01, BR-12]", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  const future = new Date("2026-06-30T16:59:00Z");
  it("belum aktivasi & belum mengisi", () => {
    expect(monitoringStatus({ primaryAccountStatus: "PENDING_ACTIVATION", submissionStatus: null, effectiveClosesAt: future, now })).toBe("PENDING_ACTIVATION");
    expect(monitoringStatus({ primaryAccountStatus: "ACTIVE", submissionStatus: null, effectiveClosesAt: future, now })).toBe("NOT_STARTED");
  });
  it("draf lewat tenggat → Tidak Mengisi; terkirim tetap terkirim", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    expect(monitoringStatus({ primaryAccountStatus: "ACTIVE", submissionStatus: "DRAFT", effectiveClosesAt: past, now })).toBe("NOT_SUBMITTED");
    expect(monitoringStatus({ primaryAccountStatus: "ACTIVE", submissionStatus: "SUBMITTED", effectiveClosesAt: past, now })).toBe("SUBMITTED");
  });
});

describe("stackCounts / csvCell", () => {
  it("hitungan per kelompok per status", () => {
    const rows = stackCounts(
      [
        { d: "Pontianak Kota", s: "DRAFT" as const },
        { d: "Pontianak Kota", s: "DRAFT" as const },
        { d: "Pontianak Barat", s: "SUBMITTED" as const },
      ],
      (r) => r.d,
      (r) => r.s,
    );
    expect(rows.map((r) => [r.group, r.total, r.counts.get("DRAFT") ?? 0])).toEqual([
      ["Pontianak Barat", 1, 0],
      ["Pontianak Kota", 2, 2],
    ]);
  });

  it("CSV: escape kutip/koma/baris baru dan cegah formula injection", () => {
    expect(csvCell('Perpus "A", B')).toBe('"Perpus ""A"", B"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
});
