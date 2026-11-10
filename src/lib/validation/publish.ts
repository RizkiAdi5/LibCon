import { CHOICE_TYPES } from "../questionnaire";
import { analyzeExpression, findConditionCycle } from "./engine";

type PublishQuestion = { id: string; code: string; type: string; optionCount: number };
type PublishRule = { questionId: string; ruleType: string; params: Record<string, unknown> };
type PublishCondition = { questionId: string; dependsOnQuestionId: string };

/**
 * FR-06.10: sebelum terbit — kode variabel unik, aturan & kondisi hanya merujuk
 * soal yang ada, logika tampil tanpa siklus. Mengembalikan daftar masalah
 * (kosong = boleh terbit), ditulis untuk admin.
 */
export function findPublishProblems(questions: PublishQuestion[], rules: PublishRule[], conditions: PublishCondition[]): string[] {
  const problems: string[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const codes = questions.map((q) => q.code);
  const codeOf = (id: string) => byId.get(id)?.code ?? "(soal terhapus)";

  if (questions.length === 0) problems.push("Kuesioner belum punya soal.");
  for (const code of new Set(codes.filter((c, i) => codes.indexOf(c) !== i))) problems.push(`Kode variabel ${code} dipakai lebih dari satu soal.`);
  for (const q of questions) {
    if (CHOICE_TYPES.includes(q.type as never) && q.optionCount < 2) problems.push(`Soal ${q.code} butuh minimal 2 opsi jawaban.`);
  }

  for (const r of rules) {
    if (!byId.has(r.questionId)) continue; // aturan milik soal terhapus tidak ikut dinilai
    if (r.ruleType === "COMPARE" && !byId.has(String(r.params.other_question_id))) {
      problems.push(`Aturan perbandingan di ${codeOf(r.questionId)} merujuk soal yang sudah dihapus.`);
    }
    if (r.ruleType === "EXPRESSION") {
      const { error } = analyzeExpression(String(r.params.expr ?? ""), [...codes, "jenis"]);
      if (error) problems.push(`Ekspresi di ${codeOf(r.questionId)}: ${error}.`);
    }
  }

  const live = conditions.filter((c) => byId.has(c.questionId));
  for (const c of live) {
    if (!byId.has(c.dependsOnQuestionId)) problems.push(`Logika tampil ${codeOf(c.questionId)} merujuk soal yang sudah dihapus.`);
  }
  const cycle = findConditionCycle(live.filter((c) => byId.has(c.dependsOnQuestionId)));
  if (cycle) problems.push(`Logika tampil berputar (siklus): ${cycle.map(codeOf).join(" → ")}.`);

  return problems;
}
