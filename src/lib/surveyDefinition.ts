import { prisma } from "./db/client";
import type { QuestionConfig } from "./questionnaire";
import type { EngineCondition, EngineQuestion, EngineRule } from "./validation/engine";

export type SurveyQuestion = EngineQuestion & { label: string; helpText: string | null; hasEvidenceUrl: boolean };
export type SurveySection = {
  id: string;
  title: string;
  description: string | null;
  evidenceLabel: string | null;
  evidenceRequired: boolean;
  questions: SurveyQuestion[];
};
export type SurveyDefinition = { title: string; instructions: string | null; sections: SurveySection[]; rules: EngineRule[]; conditions: EngineCondition[] };

/**
 * Definisi kuesioner dalam bentuk yang bisa dikirim ke klien (tanpa Decimal/Date)
 * — dipakai pratinjau admin (FR-06.09) dan pengisian peserta (M07).
 */
export async function loadSurveyDefinition(questionnaireId: string): Promise<SurveyDefinition> {
  const questionnaire = await prisma.questionnaire.findUniqueOrThrow({
    where: { id: questionnaireId },
    include: {
      sections: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            where: { deletedAt: null, isActive: true },
            orderBy: { sortOrder: "asc" },
            include: {
              options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
              institutionTypes: true,
              validationRules: { where: { deletedAt: null, isActive: true }, orderBy: { sortOrder: "asc" } },
              conditionsAsTarget: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  });

  const all = questionnaire.sections.flatMap((s) => s.questions);
  return {
    title: questionnaire.title,
    instructions: questionnaire.instructions,
    sections: questionnaire.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      evidenceLabel: s.evidenceLabel,
      evidenceRequired: s.evidenceRequired,
      questions: s.questions.map((q) => ({
        id: q.id,
        code: q.code,
        type: q.type,
        label: q.label,
        helpText: q.helpText,
        isRequired: q.isRequired,
        hasEvidenceUrl: q.hasEvidenceUrl,
        config: (q.config ?? {}) as QuestionConfig,
        institutionTypeIds: q.institutionTypes.map((t) => t.institutionTypeId),
        options: q.options.map((o) => ({ value: o.value, label: o.label })),
      })),
    })),
    rules: all.flatMap((q) =>
      q.validationRules.map((r) => ({
        id: r.id,
        questionId: q.id,
        ruleType: r.ruleType,
        params: r.params as Record<string, unknown>,
        severity: r.severity,
        message: r.message,
      })),
    ),
    conditions: all.flatMap((q) =>
      q.conditionsAsTarget.map((c) => ({
        questionId: c.questionId,
        dependsOnQuestionId: c.dependsOnQuestionId,
        operator: c.operator,
        value: c.value,
        effect: c.effect,
      })),
    ),
  };
}
