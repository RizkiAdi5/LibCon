"use client";

import { Fragment } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { SurveyDefinition } from "@/lib/surveyDefinition";
import { isEmpty, validateAnswers, type Answers } from "@/lib/validation/engine";
import { AnswerInput } from "./answer-input";

/** Kunci jawaban link bukti dukung (FR-06.08) — disimpan terpisah dari jawaban soal. */
export const evidenceKey = (scope: "section" | "question", id: string) => `evidence:${scope}:${id}`;

/**
 * Form survei: soal sesuai jenis lembaga + logika tampil, pesan validasi
 * langsung di bawah soal (Blokir/Flag), ringkasan. Dipakai pratinjau admin
 * (FR-06.09) dan nantinya pengisian peserta (M07).
 */
export function SurveyForm({
  definition,
  institutionType,
  answers,
  onChange,
  disabled,
}: {
  definition: SurveyDefinition;
  institutionType: { id: string; code: string } | null;
  answers: Answers;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const questions = definition.sections.flatMap((s) => s.questions);
  const { visible, required, issues } = validateAnswers({
    questions,
    rules: definition.rules,
    conditions: definition.conditions,
    answers,
    institutionTypeId: institutionType?.id ?? null,
    institutionTypeCode: institutionType?.code ?? null,
  });
  const blocks = issues.filter((i) => i.severity === "BLOCK");
  const flags = issues.filter((i) => i.severity === "FLAG");
  // AC M06: soal yang tidak berlaku tidak dihitung di progres
  const shown = questions.filter((q) => visible.has(q.id));
  const answered = shown.filter((q) => !isEmpty(answers[q.id])).length;

  return (
    <div className="space-y-6">
      {definition.instructions && <p className="max-w-3xl text-sm whitespace-pre-line">{definition.instructions}</p>}
      <p className="text-sm" data-testid="survey-progress">
        Progres: {answered} dari {shown.length} soal terisi
      </p>

      {definition.sections.map((section) => {
        const sectionQuestions = section.questions.filter((q) => visible.has(q.id));
        if (sectionQuestions.length === 0) return null;
        return (
          <section key={section.id} className="max-w-3xl space-y-4 rounded-md border p-4">
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
            </div>
            {sectionQuestions.map((q) => {
              const own = issues.filter((i) => i.questionId === q.id);
              const msgId = own.length ? `msg-${q.id}` : undefined;
              return (
                <div key={q.id} className="space-y-1" data-testid={`question-${q.code}`}>
                  <Label id={`label-${q.id}`} htmlFor={`q-${q.id}`}>
                    {q.label}
                    {required.has(q.id) && <span className="text-destructive"> *</span>}
                  </Label>
                  {q.helpText && <p className="text-sm text-muted-foreground">{q.helpText}</p>}
                  <AnswerInput question={q} value={answers[q.id]} onChange={(v) => onChange(q.id, v)} describedBy={msgId} disabled={disabled} />
                  {own.length > 0 && (
                    <ul id={msgId} className="space-y-0.5 text-sm">
                      {own.map((i, n) => (
                        <li key={n} className={i.severity === "BLOCK" ? "text-destructive" : "text-amber-700"}>
                          {i.severity === "BLOCK" ? "Harus diperbaiki: " : "Perlu dicek: "}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.hasEvidenceUrl && (
                    <Fragment>
                      <Label htmlFor={`ev-${q.id}`} className="text-xs text-muted-foreground">
                        Link bukti dukung (Google Drive)
                      </Label>
                      <Input
                        id={`ev-${q.id}`}
                        type="url"
                        placeholder="https://drive.google.com/..."
                        disabled={disabled}
                        value={(answers[evidenceKey("question", q.id)] as string) ?? ""}
                        onChange={(e) => onChange(evidenceKey("question", q.id), e.target.value)}
                      />
                    </Fragment>
                  )}
                </div>
              );
            })}
            {section.evidenceLabel && (
              <div className="space-y-1 border-t pt-3">
                <Label htmlFor={`ev-s-${section.id}`}>
                  Link bukti dukung bagian {section.title}
                  {section.evidenceRequired && <span className="text-destructive"> *</span>}
                </Label>
                <p className="text-sm text-muted-foreground">{section.evidenceLabel}</p>
                <Input
                  id={`ev-s-${section.id}`}
                  type="url"
                  placeholder="https://drive.google.com/..."
                  disabled={disabled}
                  value={(answers[evidenceKey("section", section.id)] as string) ?? ""}
                  onChange={(e) => onChange(evidenceKey("section", section.id), e.target.value)}
                />
              </div>
            )}
          </section>
        );
      })}

      <div className="max-w-3xl space-y-1 rounded-md border p-4 text-sm" data-testid="survey-summary">
        <p>
          <span className={blocks.length ? "text-destructive" : "text-green-700"}>{blocks.length} masalah harus diperbaiki</span> ·{" "}
          <span className="text-amber-700">{flags.length} perlu dicek admin</span>
        </p>
        {blocks.length > 0 && <p className="text-muted-foreground">Tombol Kirim nonaktif sampai semua masalah Blokir diperbaiki.</p>}
      </div>
    </div>
  );
}
