import type { Db } from "./db/client";
import { uniqueCode } from "./questionnaire";

const questionInclude = {
  options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" as const } },
  institutionTypes: true,
  validationRules: { where: { deletedAt: null } },
  conditionsAsTarget: { where: { deletedAt: null } },
};

/**
 * Salin soal beserta opsi, berlaku-untuk, aturan, dan logika tampil.
 * Rujukan antarsoal (COMPARE other_question_id, kondisi) dipetakan ke salinan
 * jika soal rujukannya ikut disalin; jika tidak, tetap merujuk soal asli
 * (duplikat di kuesioner yang sama). EXPRESSION memakai kode soal, jadi tidak
 * perlu dipetakan saat salin periode (kode sama).
 */
async function copyQuestions(
  tx: Db,
  params: {
    questionIds: string[];
    targetQuestionnaireId: string;
    sectionIdMap: Map<string, string>;
    takenCodes: string[];
    renameAsDuplicate: boolean;
    linkCopiedFrom: boolean;
    actorId: string;
  },
): Promise<Map<string, string>> {
  const questions = await tx.question.findMany({
    where: { id: { in: params.questionIds }, deletedAt: null },
    include: questionInclude,
    orderBy: { sortOrder: "asc" },
  });
  const taken = [...params.takenCodes];
  const idMap = new Map<string, string>();

  for (const q of questions) {
    const code = params.renameAsDuplicate ? uniqueCode(q.code, taken) : q.code;
    taken.push(code);
    const copy = await tx.question.create({
      data: {
        questionnaireId: params.targetQuestionnaireId,
        sectionId: params.sectionIdMap.get(q.sectionId) ?? q.sectionId,
        code,
        label: params.renameAsDuplicate ? `${q.label} (salinan)` : q.label,
        helpText: q.helpText,
        type: q.type,
        isRequired: q.isRequired,
        config: q.config ?? undefined,
        hasEvidenceUrl: q.hasEvidenceUrl,
        sortOrder: params.renameAsDuplicate ? q.sortOrder + 1 : q.sortOrder,
        // YOY_CHANGE membandingkan jawaban periode lalu lewat copied_from_id (ERD)
        copiedFromId: params.linkCopiedFrom ? q.id : null,
        createdBy: params.actorId,
      },
    });
    idMap.set(q.id, copy.id);
    if (q.options.length) {
      await tx.questionOption.createMany({
        data: q.options.map((o) => ({ questionId: copy.id, label: o.label, value: o.value, scoreValue: o.scoreValue, sortOrder: o.sortOrder, createdBy: params.actorId })),
      });
    }
    if (q.institutionTypes.length) {
      await tx.questionInstitutionType.createMany({
        data: q.institutionTypes.map((t) => ({ questionId: copy.id, institutionTypeId: t.institutionTypeId, createdBy: params.actorId })),
      });
    }
  }

  const mapId = (id: string) => idMap.get(id) ?? id;
  for (const q of questions) {
    const newId = idMap.get(q.id)!;
    for (const r of q.validationRules) {
      const p = r.params as Record<string, unknown>;
      await tx.validationRule.create({
        data: {
          questionId: newId,
          ruleType: r.ruleType,
          severity: r.severity,
          message: r.message,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          params: (r.ruleType === "COMPARE" ? { ...p, other_question_id: mapId(String(p.other_question_id)) } : p) as object,
          createdBy: params.actorId,
        },
      });
    }
    for (const c of q.conditionsAsTarget) {
      await tx.questionCondition.create({
        data: {
          questionId: newId,
          dependsOnQuestionId: mapId(c.dependsOnQuestionId),
          operator: c.operator,
          value: c.value as object,
          effect: c.effect,
          createdBy: params.actorId,
        },
      });
    }
  }
  return idMap;
}

/** FR-06.11: duplikat satu soal di bagian yang sama. */
export async function duplicateQuestion(tx: Db, questionId: string, questionnaireId: string, actorId: string) {
  const taken = await tx.question.findMany({ where: { questionnaireId, deletedAt: null }, select: { code: true } });
  return copyQuestions(tx, {
    questionIds: [questionId],
    targetQuestionnaireId: questionnaireId,
    sectionIdMap: new Map(),
    takenCodes: taken.map((t) => t.code),
    renameAsDuplicate: true,
    linkCopiedFrom: false,
    actorId,
  });
}

/** FR-06.11: duplikat bagian beserta seluruh soalnya, ditaruh di akhir. */
export async function duplicateSection(tx: Db, sectionId: string, questionnaireId: string, actorId: string) {
  const section = await tx.section.findFirstOrThrow({ where: { id: sectionId, questionnaireId, deletedAt: null } });
  const [siblings, questions, taken] = await Promise.all([
    tx.section.findMany({ where: { questionnaireId }, select: { code: true } }),
    tx.question.findMany({ where: { sectionId, deletedAt: null }, select: { id: true } }),
    tx.question.findMany({ where: { questionnaireId, deletedAt: null }, select: { code: true } }),
  ]);
  const copy = await tx.section.create({
    data: {
      questionnaireId,
      code: uniqueCode(section.code, siblings.map((s) => s.code)),
      title: `${section.title} (salinan)`,
      description: section.description,
      evidenceLabel: section.evidenceLabel,
      evidenceRequired: section.evidenceRequired,
      sortOrder: await tx.section.count({ where: { questionnaireId, deletedAt: null } }),
      createdBy: actorId,
    },
  });
  await copyQuestions(tx, {
    questionIds: questions.map((q) => q.id),
    targetQuestionnaireId: questionnaireId,
    sectionIdMap: new Map([[section.id, copy.id]]),
    takenCodes: taken.map((t) => t.code),
    renameAsDuplicate: true,
    linkCopiedFrom: false,
    actorId,
  });
  return copy;
}

/**
 * FR-02.06: salin kuesioner periode lama ke periode baru sebagai Draf — bagian,
 * soal, opsi, berlaku-untuk, logika tampil, aturan validasi. Jawaban tidak ikut.
 */
export async function copyQuestionnaireToPeriod(tx: Db, sourcePeriodId: string, targetPeriodId: string, actorId: string) {
  const source = await tx.questionnaire.findFirst({
    where: { periodId: sourcePeriodId, deletedAt: null },
    include: { sections: { where: { deletedAt: null } }, questions: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!source) return null;
  const target = await tx.questionnaire.create({
    data: { periodId: targetPeriodId, title: source.title, instructions: source.instructions, createdBy: actorId },
  });
  const sectionIdMap = new Map<string, string>();
  for (const s of source.sections) {
    const copy = await tx.section.create({
      data: {
        questionnaireId: target.id,
        code: s.code,
        title: s.title,
        description: s.description,
        evidenceLabel: s.evidenceLabel,
        evidenceRequired: s.evidenceRequired,
        sortOrder: s.sortOrder,
        createdBy: actorId,
      },
    });
    sectionIdMap.set(s.id, copy.id);
  }
  await copyQuestions(tx, {
    questionIds: source.questions.map((q) => q.id),
    targetQuestionnaireId: target.id,
    sectionIdMap,
    takenCodes: [],
    renameAsDuplicate: false,
    linkCopiedFrom: true,
    actorId,
  });
  return target;
}
