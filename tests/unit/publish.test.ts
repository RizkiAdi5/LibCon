import { describe, expect, it } from "vitest";
import { findPublishProblems } from "@/lib/validation/publish";

const q = (id: string, type = "INTEGER", optionCount = 0) => ({ id, code: id, type, optionCount });

describe("findPublishProblems [FR-06.10]", () => {
  it("kuesioner valid boleh terbit", () => {
    expect(
      findPublishProblems(
        [q("a"), q("b")],
        [{ questionId: "b", ruleType: "COMPARE", params: { op: "GTE", other_question_id: "a" } }],
        [{ questionId: "b", dependsOnQuestionId: "a" }],
      ),
    ).toEqual([]);
  });

  it("kuesioner kosong tidak boleh terbit", () => {
    expect(findPublishProblems([], [], [])).toEqual(["Kuesioner belum punya soal."]);
  });

  it("kode variabel ganda", () => {
    expect(findPublishProblems([q("a"), { ...q("b"), code: "a" }], [], [])).toContain("Kode variabel a dipakai lebih dari satu soal.");
  });

  it("aturan & kondisi yang merujuk soal terhapus", () => {
    const problems = findPublishProblems(
      [q("b")],
      [
        { questionId: "b", ruleType: "COMPARE", params: { other_question_id: "hilang" } },
        { questionId: "b", ruleType: "EXPRESSION", params: { expr: "hilang > 0" } },
      ],
      [{ questionId: "b", dependsOnQuestionId: "hilang" }],
    );
    expect(problems).toEqual([
      "Aturan perbandingan di b merujuk soal yang sudah dihapus.",
      "Ekspresi di b: Variabel tidak dikenal: hilang.",
      "Logika tampil b merujuk soal yang sudah dihapus.",
    ]);
  });

  it("siklus logika tampil dan pilihan tanpa opsi", () => {
    const problems = findPublishProblems(
      [q("a"), q("b"), q("c", "SINGLE_CHOICE", 1)],
      [],
      [
        { questionId: "a", dependsOnQuestionId: "b" },
        { questionId: "b", dependsOnQuestionId: "a" },
      ],
    );
    expect(problems).toContain("Soal c butuh minimal 2 opsi jawaban.");
    expect(problems).toContain("Logika tampil berputar (siklus): a → b.");
  });
});
