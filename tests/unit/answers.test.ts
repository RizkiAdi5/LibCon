import { describe, expect, it } from "vitest";
import { decodeAnswer, encodeAnswer, parseAnswerKey, parseIdNumber, pickPortalPeriod, surveyMode } from "@/lib/answers";

describe("encodeAnswer / decodeAnswer", () => {
  it("angka → value_number, bolak-balik", () => {
    const stored = encodeAnswer("INTEGER", 3914);
    expect(stored).toMatchObject({ valueNumber: 3914, valueText: null });
    expect(decodeAnswer("INTEGER", stored as never)).toBe(3914);
  });

  it("menolak bentuk yang salah (bukan validasi isi)", () => {
    expect(encodeAnswer("INTEGER", "3914")).toEqual({ error: "Harus berupa angka" });
    expect(encodeAnswer("INTEGER", 1e15)).toEqual({ error: "Harus berupa angka" });
    expect(encodeAnswer("DATE", "31-12-2026")).toEqual({ error: "Tanggal tidak valid" });
    expect(encodeAnswer("MULTI_CHOICE", "a")).toEqual({ error: "Pilihan tidak valid" });
    expect(encodeAnswer("TABLE", [{ a: 1 }])).toEqual({ error: "Isian tabel tidak valid" });
    expect(encodeAnswer("FILE", "x")).toEqual({ error: "Tipe soal tidak didukung" });
  });

  it("kosong disimpan sebagai null semua", () => {
    for (const [type, v] of [["INTEGER", null], ["SHORT_TEXT", ""], ["MULTI_CHOICE", []], ["TABLE", []]] as const) {
      expect(encodeAnswer(type, v)).toEqual({ valueNumber: null, valueText: null, valueDate: null, valueJson: null });
    }
  });

  it("tanggal & pilihan ganda (duplikat dibuang)", () => {
    expect(decodeAnswer("DATE", { valueNumber: null, valueText: null, valueDate: new Date("2026-06-30T00:00:00Z"), valueJson: null })).toBe("2026-06-30");
    expect(encodeAnswer("MULTI_CHOICE", ["a", "a", "b"])).toMatchObject({ valueJson: ["a", "b"] });
  });
});

describe("parseIdNumber [FR-07.07]", () => {
  it("format Indonesia: titik ribuan, koma desimal", () => {
    expect(parseIdNumber("3914")).toBe(3914);
    expect(parseIdNumber("1.234")).toBe(1234);
    expect(parseIdNumber("10.000.000.000")).toBe(10_000_000_000);
    expect(parseIdNumber("1.234,56")).toBe(1234.56);
    expect(parseIdNumber("2,5")).toBe(2.5);
    expect(parseIdNumber("1.5")).toBe(1.5);
    expect(parseIdNumber("")).toBeNull();
    expect(parseIdNumber("abc")).toBeNull();
  });
});

describe("parseAnswerKey", () => {
  it("membedakan jawaban dan link bukti", () => {
    expect(parseAnswerKey("abc")).toEqual({ kind: "answer", questionId: "abc" });
    expect(parseAnswerKey("evidence:section:s1")).toEqual({ kind: "evidence", scope: "section", id: "s1" });
  });
});

describe("surveyMode [FR-07.02, BR-10, BR-12, AC M07]", () => {
  const base = {
    periodStatus: "OPEN" as const,
    opensAt: new Date("2026-06-01T00:00:00Z"),
    effectiveClosesAt: new Date("2026-06-30T16:59:00Z"),
    submissionStatus: "DRAFT" as const,
    now: new Date("2026-06-15T00:00:00Z"),
  };

  it("periode Dibuka dan belum dikirim → bisa diisi", () => {
    expect(surveyMode(base)).toBe("editable");
    expect(surveyMode({ ...base, submissionStatus: null })).toBe("editable");
  });

  it("sebelum buka → hitung mundur", () => {
    expect(surveyMode({ ...base, periodStatus: "DRAFT" })).toBe("countdown");
    expect(surveyMode({ ...base, now: new Date("2026-05-31T00:00:00Z") })).toBe("countdown");
  });

  it("sudah tutup dan tidak diperpanjang → baca saja", () => {
    expect(surveyMode({ ...base, now: new Date("2026-06-30T16:59:00Z") })).toBe("closed");
  });

  it("periode Ditutup tapi lembaga diperpanjang → masih bisa diisi", () => {
    expect(surveyMode({ ...base, periodStatus: "CLOSED", effectiveClosesAt: new Date("2026-07-05T00:00:00Z"), now: new Date("2026-07-01T00:00:00Z") })).toBe(
      "editable",
    );
  });

  it("sudah dikirim → terkunci (BR-10)", () => {
    expect(surveyMode({ ...base, submissionStatus: "SUBMITTED" })).toBe("submitted");
  });

  it("revisi terbuka → mode revisi walau periode sudah ditutup; lewat batas revisi → baca saja [FR-08.07, FR-08.09]", () => {
    const revision = { ...base, periodStatus: "CLOSED" as const, submissionStatus: "NEEDS_REVISION" as const, now: new Date("2026-07-10T00:00:00Z") };
    expect(surveyMode({ ...revision, revisionDeadline: new Date("2026-07-15T00:00:00Z") })).toBe("revision");
    expect(surveyMode({ ...revision, revisionDeadline: new Date("2026-07-09T00:00:00Z") })).toBe("submitted");
    expect(surveyMode({ ...revision, revisionDeadline: null })).toBe("submitted");
  });
});

describe("pickPortalPeriod", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  const p = (id: string, status: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED", opens: string, closes: string) => ({
    id,
    status,
    opensAt: new Date(opens),
    closesAt: new Date(closes),
  });

  it("utamakan yang Dibuka, lalu Draf terdekat, lalu Ditutup terbaru", () => {
    const closed = p("c", "CLOSED", "2025-06-01", "2025-06-30");
    const draft = p("d", "DRAFT", "2026-07-01", "2026-07-30");
    const open = p("o", "OPEN", "2026-06-01", "2026-06-30");
    expect(pickPortalPeriod([closed, draft, open], now)?.id).toBe("o");
    expect(pickPortalPeriod([closed, draft], now)?.id).toBe("d");
    expect(pickPortalPeriod([closed, p("a", "ARCHIVED", "2024-06-01", "2024-06-30")], now)?.id).toBe("c");
    expect(pickPortalPeriod([], now)).toBeNull();
  });
});
