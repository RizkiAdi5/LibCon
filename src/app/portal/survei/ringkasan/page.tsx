import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { evidenceKey } from "@/lib/answers";
import { checkSubmission, loadParticipantSurvey } from "@/lib/participantSurvey";
import { formatAnswer } from "@/lib/answerFormat";
import { SubmitForm } from "./submit-form";

/** FR-07.08: semua jawaban per bagian, soal kosong, error Blokir dengan link ke soal. */
export default async function RingkasanPage({ searchParams }: { searchParams: Promise<{ terkirim?: string }> }) {
  const user = await requireRole(["PARTICIPANT"]);
  const [{ terkirim }, survey] = await Promise.all([searchParams, loadParticipantSurvey(user.institutionId!)]);
  if (!survey || survey.mode === "countdown") redirect("/portal/beranda");
  const check = await checkSubmission(survey);
  const sent = survey.mode === "submitted";
  const editable = survey.mode === "editable" || survey.mode === "revision";
  const problems = check.blocks.length + check.missingEvidence.length;
  const codeOf = new Map(survey.definition.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Ringkasan jawaban</h1>
      {terkirim && sent && (
        <p role="status" className="rounded-md border border-green-600/50 p-3 text-sm text-green-700">
          Survei berhasil dikirim {survey.submission?.lastSubmittedAt && formatWib(survey.submission.lastSubmittedAt)}. Tanda terima dikirim ke email akun lembaga.
        </p>
      )}
      {sent && !terkirim && <p className="text-sm text-green-700">Survei sudah dikirim — jawaban terkunci.</p>}

      {editable && problems > 0 && (
        <section className="space-y-2 rounded-md border border-destructive/50 p-4" data-testid="blocking-issues">
          <h2 className="font-semibold text-destructive">{problems} masalah harus diperbaiki sebelum mengirim</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {check.blocks.map((i, n) => {
              const q = codeOf.get(i.questionId)!;
              return (
                <li key={n}>
                  <Link href={`/portal/survei#soal-${q.code}`} className="underline">
                    {q.label}
                  </Link>
                  : {i.message}
                </li>
              );
            })}
            {check.missingEvidence.map((s) => (
              <li key={s.id}>
                <Link href={`/portal/survei#section-${s.id}`} className="underline">
                  Bagian {s.title}
                </Link>
                : link bukti dukung wajib diisi
              </li>
            ))}
          </ul>
        </section>
      )}

      {survey.definition.sections.map((s) => {
        const qs = s.questions.filter((q) => check.visible.has(q.id));
        if (qs.length === 0) return null;
        const evidence = survey.answers[evidenceKey("section", s.id)];
        return (
          <section key={s.id} className="space-y-2 rounded-md border p-4">
            <h2 className="font-semibold">{s.title}</h2>
            <dl className="space-y-1 text-sm">
              {qs.map((q) => {
                const text = formatAnswer(q, survey.answers[q.id]);
                return (
                  <div key={q.id} className="grid gap-1 md:grid-cols-2">
                    <dt>{q.label}</dt>
                    <dd className={text ? "" : "text-muted-foreground"}>
                      {text || (
                        <Link href={`/portal/survei#soal-${q.code}`} className="underline">
                          Belum diisi
                        </Link>
                      )}
                    </dd>
                  </div>
                );
              })}
              {s.evidenceLabel && (
                <div className="grid gap-1 md:grid-cols-2">
                  <dt>Link bukti dukung bagian</dt>
                  <dd className="break-all">{(evidence as string) || <span className="text-muted-foreground">Belum diisi</span>}</dd>
                </div>
              )}
            </dl>
          </section>
        );
      })}

      {editable && <SubmitForm periodId={survey.period.id} blocked={problems > 0} />}
    </div>
  );
}
