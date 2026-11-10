import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { BuilderQuestionType, QuestionConfig } from "@/lib/questionnaire";
import { COMPARE_OP_LABEL } from "@/lib/validation/engine";
import type { RuleInput } from "@/lib/validation/question";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { deleteConditionAction, saveConditionAction } from "../../../actions";
import { loadQuestionEditor } from "../load";
import { QuestionForm } from "../question-form";
import { RulesPanel } from "../rules-panel";

const OPERATOR_LABEL: Record<string, string> = { ...COMPARE_OP_LABEL, IN: "salah satu dari", NOT_EMPTY: "sudah diisi" };

export default async function UbahSoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string; questionId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ periodId, questionId }, { ok, error }] = await Promise.all([params, searchParams]);
  const { questionnaire, institutionTypes, published } = await loadQuestionEditor(periodId);
  if (!z.uuid().safeParse(questionId).success) notFound();

  const [question, others, typeCodes] = await Promise.all([
    prisma.question.findFirst({
      where: { id: questionId, questionnaireId: questionnaire.id, deletedAt: null },
      include: {
        options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        institutionTypes: true,
        validationRules: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
        conditionsAsTarget: { where: { deletedAt: null }, include: { dependsOnQuestion: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.question.findMany({
      where: { questionnaireId: questionnaire.id, deletedAt: null, id: { not: questionId } },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, code: true, label: true, type: true },
    }),
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { code: true } }),
  ]);
  if (!question) notFound();
  const ref = { id: question.id, code: question.code, label: question.label, type: question.type };

  return (
    <div className="space-y-8">
      <Link href={`/admin/kuesioner/${periodId}`} className="text-sm underline">
        ← Builder kuesioner
      </Link>
      <h1 className="text-xl font-semibold">
        Soal <code>{question.code}</code>
      </h1>
      <FlashMessage ok={ok} error={error} />
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

      <RulesPanel
        periodId={periodId}
        question={ref}
        otherQuestions={others}
        institutionTypeCodes={typeCodes.map((t) => t.code)}
        published={published}
        rules={question.validationRules.map((r) => ({
          id: r.id,
          ruleType: r.ruleType as RuleInput["ruleType"],
          severity: r.severity,
          message: r.message,
          params: r.params as Record<string, unknown>,
        }))}
      />

      <section className="max-w-3xl space-y-3">
        <h2 className="font-semibold">Logika tampil</h2>
        <p className="text-sm text-muted-foreground">Tanpa kondisi Tampil, soal selalu tampil. Beberapa kondisi Tampil harus terpenuhi semua.</p>
        <ul className="space-y-2 text-sm">
          {question.conditionsAsTarget.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <span>
                {c.effect === "SHOW" ? "Tampil" : "Menjadi wajib"} jika <code>{c.dependsOnQuestion.code}</code> {OPERATOR_LABEL[c.operator]}{" "}
                {c.value === null ? "" : Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}
              </span>
              {!published && (
                <ConfirmAction
                  action={deleteConditionAction}
                  fields={{ periodId, questionId: question.id, conditionId: c.id }}
                  label="Hapus"
                  confirmLabel="Ya, hapus kondisi"
                  impact="Soal tidak lagi bergantung pada kondisi ini."
                />
              )}
            </li>
          ))}
        </ul>
        {!published && others.length > 0 && (
          <form action={saveConditionAction} className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
            <input type="hidden" name="periodId" value={periodId} />
            <input type="hidden" name="questionId" value={question.id} />
            <div className="space-y-1">
              <Label htmlFor="effect">Soal ini</Label>
              <select id="effect" name="effect" className="h-9 w-full rounded-md border px-2 text-sm">
                <option value="SHOW">Tampil</option>
                <option value="REQUIRE">Menjadi wajib</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dependsOnQuestionId">jika soal</Label>
              <select id="dependsOnQuestionId" name="dependsOnQuestionId" className="h-9 w-full rounded-md border px-2 text-sm" required>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="operator">operator</Label>
              <select id="operator" name="operator" className="h-9 w-full rounded-md border px-2 text-sm">
                {Object.entries(OPERATOR_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="value">nilai (pilihan: kode opsi, mis. yes)</Label>
              <Input id="value" name="value" placeholder="yes / 10 / a, b" />
            </div>
            <div className="md:col-span-4">
              <Button type="submit" variant="outline">
                Tambah kondisi
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
