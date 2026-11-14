import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { loadParticipantSurvey } from "@/lib/participantSurvey";
import { SUBMISSION_STATUS } from "@/lib/submissionStatus";
import { buttonVariants } from "@/components/ui/button";
import { IconOnly } from "@/components/action-icon";
import { RevisionBanner } from "@/components/survey/revision-banner";

const DAY = 24 * 60 * 60 * 1000;

/** FR-07.01 + FR-07.02: status kiriman, sisa hari, hitung mundur / mode baca saja. */
export default async function PortalBerandaPage() {
  const user = await requireRole(["PARTICIPANT"]);
  const survey = await loadParticipantSurvey(user.institutionId!);
  const now = new Date();

  if (!survey) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Beranda</h1>
        <p className="text-sm text-muted-foreground">Belum ada survei yang dibuka. Informasi akan dikirim lewat email resmi lembaga.</p>
      </div>
    );
  }

  const raw = survey.submission?.status ?? "NOT_STARTED";
  // BR-12: Tidak Mengisi yang tenggatnya diperpanjang masih bisa diisi → tampil sebagai Draf
  const status = SUBMISSION_STATUS[raw === "NOT_SUBMITTED" && survey.mode === "editable" ? "DRAFT" : raw];
  const progress = Number(survey.submission?.progressPct ?? 0);
  const cta = survey.mode === "revision" ? "Perbaiki soal revisi" : survey.mode === "editable" ? (survey.submission ? "Lanjutkan mengisi" : "Mulai mengisi") : "Lihat isian";
  const msLeft = survey.effectiveClosesAt.getTime() - now.getTime();
  const msToOpen = survey.period.opensAt.getTime() - now.getTime();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Beranda</h1>
      <section className="space-y-2 rounded-md border p-4">
        <h2 className="font-semibold">{survey.period.name}</h2>
        {survey.mode === "countdown" ? (
          <p data-testid="countdown">
            Survei dibuka dalam {Math.floor(msToOpen / DAY)} hari {Math.floor((msToOpen % DAY) / (60 * 60 * 1000))} jam, pada{" "}
            {formatWib(survey.period.opensAt)}.
          </p>
        ) : (
          <>
            <p>
              Status: <span className={status.className}>{status.label}</span> · Progres {new Intl.NumberFormat("id-ID").format(progress)}%
            </p>
            <p className="text-sm">
              Tenggat {formatWib(survey.effectiveClosesAt)}
              {survey.mode === "editable" && <> — sisa {Math.ceil(msLeft / DAY)} hari</>}
            </p>
            {survey.mode === "revision" && survey.revision && (
              <RevisionBanner deadlineAt={survey.revision.deadlineAt} generalNote={survey.revision.generalNote} count={survey.revisionNotes.size} />
            )}
            {survey.mode === "closed" && <p className="text-sm text-amber-700">Periode pengisian sudah ditutup. Isian hanya bisa dilihat.</p>}
            {survey.mode === "submitted" && survey.submission?.lastSubmittedAt && (
              <p className="text-sm text-green-700">Terkirim {formatWib(survey.submission.lastSubmittedAt)}.</p>
            )}
            <Link href="/portal/survei" className={buttonVariants()}>
              <IconOnly label={cta} text={cta} />
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
