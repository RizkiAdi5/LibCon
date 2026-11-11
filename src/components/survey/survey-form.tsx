"use client";

import { Fragment, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { SurveyDefinition } from "@/lib/surveyDefinition";
import { evidenceKey } from "@/lib/answers";
import { isEmpty, validateAnswers, type Answers } from "@/lib/validation/engine";
import { AnswerInput } from "./answer-input";

/**
 * Form survei: soal sesuai jenis lembaga + logika tampil, pesan validasi di
 * bawah soal, navigasi per bagian dengan progres. Dipakai pratinjau admin
 * (FR-06.09, semua pesan langsung tampil) dan pengisian peserta (M07:
 * Blokir tampil setelah isian ditinggalkan, Flag disembunyikan — FR-07.06).
 */
export function SurveyForm({
  definition,
  institutionType,
  answers,
  onChange,
  disabled,
  participant,
  revisionNotes,
}: {
  definition: SurveyDefinition;
  institutionType: { id: string; code: string } | null;
  answers: Answers;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
  participant?: boolean;
  /** FR-08.07: hanya soal ini (id → catatan admin) yang bisa diubah saat revisi */
  revisionNotes?: Record<string, string>;
}) {
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const questions = definition.sections.flatMap((s) => s.questions);
  const { visible, required, issues: all } = validateAnswers({
    questions,
    rules: definition.rules,
    conditions: definition.conditions,
    answers,
    institutionTypeId: institutionType?.id ?? null,
    institutionTypeCode: institutionType?.code ?? null,
  });
  // FR-07.06: peserta tidak melihat Flag sebelum kirim; Blokir muncul setelah soal ditinggalkan
  const issues = participant ? all.filter((i) => i.severity === "BLOCK" && touched.has(i.questionId)) : all;
  const blocks = all.filter((i) => i.severity === "BLOCK");
  const flags = all.filter((i) => i.severity === "FLAG");
  const shown = questions.filter((q) => visible.has(q.id)); // AC M06: soal tak berlaku tidak dihitung
  const answered = shown.filter((q) => !isEmpty(answers[q.id])).length;

  const sections = definition.sections
    .map((s) => {
      const qs = s.questions.filter((q) => visible.has(q.id));
      const done = qs.filter((q) => !isEmpty(answers[q.id])).length;
      return { section: s, questions: qs, pct: qs.length ? Math.round((done / qs.length) * 100) : 100, hasError: issues.some((i) => qs.some((q) => q.id === i.questionId)) };
    })
    .filter((s) => s.questions.length > 0);

  return (
    <div className="space-y-6">
      {definition.instructions && <p className="max-w-3xl text-sm whitespace-pre-line">{definition.instructions}</p>}
      <p className="text-sm" data-testid="survey-progress">
        Progres: {answered} dari {shown.length} soal terisi ({shown.length ? Math.round((answered / shown.length) * 100) : 0}%)
      </p>

      {/* FR-07.05: navigasi per bagian dengan progres dan penanda bagian yang masih ada error */}
      <nav aria-label="Bagian survei" className="max-w-3xl">
        <ul className="flex flex-wrap gap-2 text-sm">
          {sections.map(({ section, pct, hasError }) => (
            <li key={section.id}>
              <a href={`#section-${section.id}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
                {section.title} · {pct}%{hasError && <span className="text-destructive">· ada error</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map(({ section, questions: sectionQuestions }) => (
        <section key={section.id} id={`section-${section.id}`} className="max-w-3xl scroll-mt-4 space-y-4 rounded-md border p-4">
          <div>
            <h2 className="font-semibold">{section.title}</h2>
            {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
          </div>
          {sectionQuestions.map((q) => {
            const own = issues.filter((i) => i.questionId === q.id);
            const opened = revisionNotes ? q.id in revisionNotes : true;
            const locked = disabled || !opened;
            const msgId = own.length ? `msg-${q.id}` : undefined;
            return (
              <div
                key={q.id}
                id={`soal-${q.code}`}
                className="scroll-mt-4 space-y-1"
                data-testid={`question-${q.code}`}
                onBlur={() => !touched.has(q.id) && setTouched((t) => new Set(t).add(q.id))}
              >
                <Label id={`label-${q.id}`} htmlFor={`q-${q.id}`}>
                  {q.label}
                  {required.has(q.id) && <span className="text-destructive"> *</span>}
                </Label>
                {q.helpText && <p className="text-sm text-muted-foreground">{q.helpText}</p>}
                {revisionNotes && opened && (
                  <p className="rounded-md border border-amber-600/50 p-2 text-sm text-amber-800" data-testid={`revision-note-${q.code}`}>
                    Perlu direvisi{revisionNotes[q.id] ? `: ${revisionNotes[q.id]}` : ""}
                  </p>
                )}
                {revisionNotes && !opened && <p className="text-xs text-muted-foreground">Tidak perlu diubah</p>}
                <AnswerInput question={q} value={answers[q.id]} onChange={(v) => onChange(q.id, v)} describedBy={msgId} disabled={locked} />
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
                      disabled={locked}
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
                disabled={disabled || (!!revisionNotes && !sectionQuestions.some((q) => q.id in revisionNotes))}
                value={(answers[evidenceKey("section", section.id)] as string) ?? ""}
                onChange={(e) => onChange(evidenceKey("section", section.id), e.target.value)}
              />
            </div>
          )}
        </section>
      ))}

      {!participant && (
        <div className="max-w-3xl space-y-1 rounded-md border p-4 text-sm" data-testid="survey-summary">
          <p>
            <span className={blocks.length ? "text-destructive" : "text-green-700"}>{blocks.length} masalah harus diperbaiki</span> ·{" "}
            <span className="text-amber-700">{flags.length} perlu dicek admin</span>
          </p>
          {blocks.length > 0 && <p className="text-muted-foreground">Tombol Kirim nonaktif sampai semua masalah Blokir diperbaiki.</p>}
        </div>
      )}
    </div>
  );
}
