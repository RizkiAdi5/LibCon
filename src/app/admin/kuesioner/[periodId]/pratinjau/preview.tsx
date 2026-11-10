"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SurveyForm } from "@/components/survey/survey-form";
import type { SurveyDefinition } from "@/lib/surveyDefinition";
import { validateAnswers, type Answers } from "@/lib/validation/engine";

/** FR-06.09: uji coba isi + lihat pesan validasi, tanpa menyimpan apa pun. */
export function Preview({ definition, institutionType }: { definition: SurveyDefinition; institutionType: { id: string; code: string } | null }) {
  const [answers, setAnswers] = useState<Answers>({});
  const { issues } = validateAnswers({
    questions: definition.sections.flatMap((s) => s.questions),
    rules: definition.rules,
    conditions: definition.conditions,
    answers,
    institutionTypeId: institutionType?.id ?? null,
    institutionTypeCode: institutionType?.code ?? null,
  });
  const blocked = issues.some((i) => i.severity === "BLOCK");

  return (
    <div className="space-y-4">
      <SurveyForm definition={definition} institutionType={institutionType} answers={answers} onChange={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))} />
      <div className="flex gap-3">
        {/* pratinjau: hanya menunjukkan apakah peserta bisa mengirim */}
        <Button type="button" disabled={blocked}>
          Kirim (pratinjau)
        </Button>
        <Button type="button" variant="outline" onClick={() => setAnswers({})}>
          Kosongkan isian
        </Button>
      </div>
    </div>
  );
}
