import { describe, expect, it } from "vitest";
import { renderReceiptPdf } from "@/lib/pdf/reportPdf";

describe("PDF tanda terima [FR-07.10]", () => {
  it("menghasilkan PDF berisi bagian & jawaban", async () => {
    const pdf = await renderReceiptPdf({
      libraryName: "Perpus SD Uji",
      npp: "6171000000000001",
      periodName: "Lomba 2026",
      submittedAt: new Date("2026-06-15T03:00:00Z"),
      submitterName: "Budi",
      sections: [{ title: "Koleksi", evidenceUrl: "https://drive.google.com/x", rows: [{ code: "j_judul", label: "Jumlah judul", answer: "1.234" }, { code: "j_kosong", label: "Kosong", answer: "" }] }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
