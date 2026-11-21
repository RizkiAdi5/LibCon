import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withDb } from "@/lib/db/withDb";
import { requireRole, runAsUser } from "@/lib/auth/guard";
import { formatWib, toWibInputValue } from "@/lib/date";
import { diffAnswers, evidenceKey } from "@/lib/answers";
import { formatAnswer } from "@/lib/answerFormat";
import { SUBMISSION_STATUS } from "@/lib/submissionStatus";
import { loadSubmissionForReview, scoresPublished } from "@/lib/submissionReview";
import { RecordHistory } from "@/components/record-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { acceptFlagAction, requestRevisionAction, unverifyAction, verifyAction } from "../actions";

const FLAG_STATUS = {
  OPEN: { label: "Terbuka", className: "text-destructive" },
  ACCEPTED_BY_ADMIN: { label: "Diterima", className: "text-green-700" },
  RESOLVED: { label: "Selesai (diperbaiki/putaran baru)", className: "text-muted-foreground" },
} as const;

/** FR-08.03: jawaban per bagian, flag di samping soal, link bukti, riwayat versi + bandingkan. */
export default async function DetailKirimanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; a?: string; b?: string }>;
}) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const review = await loadSubmissionForReview(id);
  if (!review) notFound();
  const { submission, definition, answers, visible } = review;

  // FR-13: lihat kiriman lembaga tercatat di activity_logs
  await runAsUser(user, () =>
    withDb((tx) =>
      tx.activityLog.create({
        data: { userId: user.id, actorRole: user.role, activity: "VIEW_SUBMISSION", entityType: "submission", entityId: submission.id, description: `Lihat kiriman ${submission.institution.libraryName}` },
      }),
    ),
  );

  const questions = definition.sections.flatMap((s) => s.questions);
  const status = SUBMISSION_STATUS[submission.status];
  const openRevision = submission.revisionRequests.find((r) => r.status === "OPEN");
  const now = new Date();
  const defaultDeadline = toWibInputValue(new Date(now.getTime() + submission.period.revisionDeadlineDays * 24 * 60 * 60 * 1000));

  // FR-08.10: bandingkan dua versi (default: dua putaran terakhir)
  const snaps = submission.snapshots;
  const snapA = snaps.find((s) => String(s.revisionRound) === sp.a) ?? snaps.at(-2);
  const snapB = snaps.find((s) => String(s.revisionRound) === sp.b) ?? snaps.at(-1);
  const diff =
    snapA && snapB && snapA.id !== snapB.id
      ? diffAnswers(questions.map((q) => q.id), snapA.answers as Record<string, unknown>, snapB.answers as Record<string, unknown>)
      : null;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href={`/admin/verifikasi?periode=${submission.periodId}`} className="text-sm underline">
        ← Daftar kiriman
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{submission.institution.libraryName}</h1>
        <p className="text-sm">
          {submission.period.name} · NPP {submission.institution.npp} · {submission.institution.type.name} · Kec. {submission.institution.region?.parent?.name}
        </p>
        <p className="text-sm">
          Status: <span className={status.className}>{status.label}</span> · Putaran {submission.revisionRound}
          {submission.lastSubmittedAt && <> · dikirim {formatWib(submission.lastSubmittedAt)} oleh {submission.submitterName}</>}
          {submission.verifiedAt && <> · diverifikasi {formatWib(submission.verifiedAt)} ({submission.verifiedBy?.fullName})</>}
        </p>
        {submission.adminNote && <p className="text-sm text-muted-foreground">Catatan: {submission.adminNote}</p>}
      </div>
      <FlashMessage ok={sp.ok} error={sp.error} />

      {/* keputusan admin (flowchart 08) */}
      <section className="flex flex-wrap items-start gap-4">
        {submission.status === "SUBMITTED" && (
          <ConfirmAction
            action={verifyAction}
            fields={{ submissionId: submission.id }}
            label="Verifikasi kiriman"
            confirmLabel="Ya, verifikasi"
            impact={`Kiriman masuk perhitungan skor resmi.${submission.openFlagCount ? ` Masih ada ${submission.openFlagCount} flag terbuka.` : ""}`}
          />
        )}
        {submission.status === "VERIFIED" && !scoresPublished(submission.period) && (
          <details>
            <summary className="cursor-pointer text-sm text-destructive underline">Batalkan verifikasi</summary>
            <form action={unverifyAction} className="mt-2 w-80 space-y-2 rounded-md border border-destructive/50 p-3">
              <input type="hidden" name="submissionId" value={submission.id} />
              <Label htmlFor="reason">Alasan pembatalan</Label>
              <textarea id="reason" name="reason" required className="min-h-12 w-full rounded-md border p-2 text-sm" />
              <Button type="submit" variant="destructive" size="sm">
                Batalkan verifikasi
              </Button>
            </form>
          </details>
        )}
        {openRevision && (
          <p className="text-sm text-amber-700">
            Revisi putaran {openRevision.round} terbuka untuk {openRevision.items.length} soal sampai {formatWib(openRevision.deadlineAt)}.
          </p>
        )}
      </section>

      {submission.status === "SUBMITTED" && (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer font-semibold">Minta revisi</summary>
          <form action={requestRevisionAction} className="mt-3 space-y-3">
            <input type="hidden" name="submissionId" value={submission.id} />
            {submission.period.revisionScope === "ALL" ? (
              <p className="text-sm">Pengaturan periode: revisi membuka <b>semua soal</b>. Catatan per soal tetap bisa diisi.</p>
            ) : (
              <p className="text-sm">Centang soal yang dibuka untuk revisi (pengaturan periode: soal terpilih).</p>
            )}
            <ul className="space-y-2 text-sm">
              {questions
                .filter((q) => visible.has(q.id))
                .map((q) => (
                  <li key={q.id} className="grid gap-1 md:grid-cols-2">
                    <label className="flex items-center gap-2">
                      {submission.period.revisionScope !== "ALL" && <input type="checkbox" name="questionIds" value={q.id} aria-label={`Buka revisi ${q.label}`} />}
                      {q.label}
                    </label>
                    <Input name={`note_${q.id}`} aria-label={`Catatan revisi ${q.label}`} placeholder="Catatan untuk soal ini (opsional)" />
                  </li>
                ))}
            </ul>
            <div className="space-y-1">
              <Label htmlFor="generalNote">Catatan umum</Label>
              <textarea id="generalNote" name="generalNote" className="min-h-12 w-full rounded-md border p-2 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="deadlineAt">Batas revisi (WIB)</Label>
              <Input id="deadlineAt" name="deadlineAt" type="datetime-local" defaultValue={defaultDeadline} className="w-56" required />
            </div>
            <Button type="submit">Buka revisi & kirim email</Button>
          </form>
        </details>
      )}

      {definition.sections.map((s) => {
        const qs = s.questions.filter((q) => visible.has(q.id));
        if (qs.length === 0) return null;
        const sectionEvidence = answers[evidenceKey("section", s.id)] as string | undefined;
        return (
          <section key={s.id} className="space-y-3 rounded-md border p-4">
            <h2 className="font-semibold">{s.title}</h2>
            {s.evidenceLabel && (
              <p className="text-sm">
                Bukti dukung bagian:{" "}
                {sectionEvidence ? (
                  <a href={sectionEvidence} target="_blank" rel="noreferrer noopener" className="break-all underline">
                    {sectionEvidence}
                  </a>
                ) : (
                  <span className="text-muted-foreground">tidak diisi</span>
                )}
              </p>
            )}
            {qs.map((q) => {
              const flags = submission.validationResults.filter((v) => v.questionId === q.id);
              const evidence = answers[evidenceKey("question", q.id)] as string | undefined;
              return (
                <div key={q.id} className="grid gap-2 border-t pt-2 text-sm md:grid-cols-2" data-testid={`review-${q.code}`}>
                  <div>
                    <p>{q.label}</p>
                    <p className="font-medium">{formatAnswer(q, answers[q.id]) || <span className="text-muted-foreground">Kosong</span>}</p>
                    {evidence && (
                      <a href={evidence} target="_blank" rel="noreferrer noopener" className="break-all underline">
                        Link bukti
                      </a>
                    )}
                  </div>
                  <div className="space-y-2">
                    {flags.map((f) => (
                      <div key={f.id} className="rounded-md border p-2">
                        <p>
                          <span className={FLAG_STATUS[f.status].className}>⚑ {FLAG_STATUS[f.status].label}</span> · putaran {f.revisionRound}: {f.message}
                        </p>
                        {f.reviewNote && <p className="text-muted-foreground">Catatan: {f.reviewNote}</p>}
                        {f.status === "OPEN" && (
                          <form action={acceptFlagAction} className="mt-1 flex gap-2">
                            <input type="hidden" name="submissionId" value={submission.id} />
                            <input type="hidden" name="resultId" value={f.id} />
                            <Input name="note" placeholder="Catatan (opsional)" aria-label={`Catatan terima flag ${q.label}`} className="h-8" />
                            <Button type="submit" size="sm" variant="outline">
                              Terima
                            </Button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-semibold">Riwayat versi</h2>
        <ul className="text-sm">
          {snaps.map((s) => (
            <li key={s.id}>
              Versi putaran {s.revisionRound} — {formatWib(s.submittedAt)} oleh {s.submittedBy.fullName}
            </li>
          ))}
        </ul>
        {snaps.length > 1 && (
          <form className="flex flex-wrap items-end gap-2 text-sm">
            <Label htmlFor="a">Bandingkan putaran</Label>
            <select id="a" name="a" defaultValue={String(snapA?.revisionRound)} className="h-8 rounded-md border px-2">
              {snaps.map((s) => (
                <option key={s.id}>{s.revisionRound}</option>
              ))}
            </select>
            <Label htmlFor="b">dengan</Label>
            <select id="b" name="b" defaultValue={String(snapB?.revisionRound)} className="h-8 rounded-md border px-2">
              {snaps.map((s) => (
                <option key={s.id}>{s.revisionRound}</option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Bandingkan
            </Button>
          </form>
        )}
        {diff && snapA && snapB && (
          <table className="w-full text-sm" data-testid="version-compare">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Soal</th>
                <th>Putaran {snapA.revisionRound}</th>
                <th>Putaran {snapB.revisionRound}</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((d) => {
                const q = questions.find((x) => x.id === d.questionId)!;
                return (
                  <tr key={d.questionId} className={d.changed ? "border-t bg-amber-50 font-medium" : "border-t"} data-changed={d.changed}>
                    <td className="py-1">
                      {q.label}
                      {d.changed && <span className="sr-only"> (berubah)</span>}
                    </td>
                    <td>{formatAnswer(q, d.before) || "–"}</td>
                    <td>{formatAnswer(q, d.after) || "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <RecordHistory
        targets={[
          { table: "submissions", ids: [submission.id] },
          { table: "revision_requests", ids: submission.revisionRequests.map((r) => r.id) },
          { table: "validation_results", ids: submission.validationResults.map((v) => v.id) },
        ]}
        labels={{ submissions: "kiriman", revision_requests: "permintaan revisi", validation_results: "flag validasi" }}
        returnTo={`/admin/verifikasi/${submission.id}`}
        role={user.role}
      />
    </div>
  );
}
