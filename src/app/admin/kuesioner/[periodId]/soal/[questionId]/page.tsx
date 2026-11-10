import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { BuilderQuestionType, QuestionConfig } from "@/lib/questionnaire";
import { loadQuestionEditor } from "../load";
import { QuestionForm } from "../question-form";

export default async function UbahSoalPage({ params }: { params: Promise<{ periodId: string; questionId: string }> }) {
  const { periodId, questionId } = await params;
  const { questionnaire, institutionTypes, published } = await loadQuestionEditor(periodId);
  if (!z.uuid().safeParse(questionId).success) notFound();

  const question = await prisma.question.findFirst({
    where: { id: questionId, questionnaireId: questionnaire.id, deletedAt: null },
    include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } }, institutionTypes: true },
  });
  if (!question) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/admin/kuesioner/${periodId}`} className="text-sm underline">
        ← Builder kuesioner
      </Link>
      <h1 className="text-xl font-semibold">
        Soal <code>{question.code}</code>
      </h1>
      <QuestionForm
        periodId={periodId}
        questionId={question.id}
        sections={questionnaire.sections}
        institutionTypes={institutionTypes}
        takenCodes={questionnaire.questions.filter((q) => q.id !== question.id).map((q) => q.code)}
        published={published}
        initial={{
          sectionId: question.sectionId,
          label: question.label,
          code: question.code,
          helpText: question.helpText ?? "",
          type: question.type as BuilderQuestionType,
          isRequired: question.isRequired,
          hasEvidenceUrl: question.hasEvidenceUrl,
          institutionTypeIds: question.institutionTypes.map((t) => t.institutionTypeId),
          options: question.options.map((o) => ({ label: o.label, scoreValue: o.scoreValue === null ? null : Number(o.scoreValue) })),
          config: (question.config ?? {}) as QuestionConfig,
        }}
      />
    </div>
  );
}
