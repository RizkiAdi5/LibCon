import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { loadParticipantSurvey } from "@/lib/participantSurvey";
import { buttonVariants } from "@/components/ui/button";
import { RevisionBanner } from "@/components/survey/revision-banner";
import { SurveyFill } from "./survey-fill";

export default async function SurveiPage() {
  const user = await requireRole(["PARTICIPANT"]);
  const survey = await loadParticipantSurvey(user.institutionId!);

  if (!survey) return <p className="text-sm text-muted-foreground">Belum ada survei yang diterbitkan.</p>;
  if (survey.mode === "countdown") {
    return <p className="text-sm">Survei {survey.period.name} dibuka {formatWib(survey.period.opensAt)}.</p>;
  }

  // FR-08.07: mode revisi = bisa mengisi, tapi hanya soal yang dibuka admin
  const editable = survey.mode === "editable" || survey.mode === "revision";
  const revisionNotes = survey.mode === "revision" ? Object.fromEntries(survey.revisionNotes) : undefined;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{survey.definition.title}</h1>
        <p className="text-sm text-muted-foreground">
          {survey.period.name} · tenggat {formatWib(survey.effectiveClosesAt)}
        </p>
      </div>
      {survey.mode === "revision" && survey.revision && (
        <RevisionBanner deadlineAt={survey.revision.deadlineAt} generalNote={survey.revision.generalNote} count={survey.revisionNotes.size} />
      )}
      {survey.mode === "submitted" && <p className="text-sm text-green-700">Survei sudah dikirim — jawaban terkunci dan hanya bisa dilihat.</p>}
      {survey.mode === "closed" && <p className="text-sm text-amber-700">Periode pengisian sudah ditutup. Isian bisa dilihat tapi tidak bisa diubah.</p>}
      {editable && (
        <Link href="/portal/survei/ringkasan" className={buttonVariants({ variant: "outline" })}>
          Lihat ringkasan & kirim
        </Link>
      )}
      <SurveyFill
        periodId={survey.period.id}
        definition={survey.definition}
        institutionType={{ id: survey.institution.typeId, code: survey.institution.type.code }}
        initialAnswers={survey.answers}
        editable={editable}
        lastSavedAt={survey.submission?.lastSavedAt?.toISOString() ?? null}
        revisionNotes={revisionNotes}
      />
      {editable && (
        <Link href="/portal/survei/ringkasan" className={buttonVariants()}>
          Lihat ringkasan & kirim
        </Link>
      )}
    </div>
  );
}
