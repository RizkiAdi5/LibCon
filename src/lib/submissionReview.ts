import { prisma } from "./db/client";
import { decodeSubmissionAnswers } from "./participantSurvey";
import { loadSurveyDefinition } from "./surveyDefinition";
import { resolveVisibility } from "./validation/engine";

/** Data halaman detail kiriman admin (FR-08.03): jawaban, flag, versi, revisi. */
export async function loadSubmissionForReview(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      institution: { include: { type: true, region: { include: { parent: true } } } },
      period: { include: { questionnaire: true } },
      answers: true,
      validationResults: { orderBy: [{ revisionRound: "asc" }, { createdAt: "asc" }], include: { reviewedBy: true } },
      snapshots: { orderBy: { revisionRound: "asc" }, include: { submittedBy: true } },
      revisionRequests: { orderBy: { round: "desc" }, include: { items: true, requestedBy: true } },
      lastSubmittedBy: true,
      verifiedBy: true,
    },
  });
  if (!submission?.period.questionnaire) return null;
  const definition = await loadSurveyDefinition(submission.period.questionnaire.id);
  const answers = decodeSubmissionAnswers(definition, submission.answers, submission.sectionEvidence);
  const { visible } = resolveVisibility(
    definition.sections.flatMap((s) => s.questions),
    definition.conditions,
    answers,
    submission.institution.typeId,
  );
  return { submission, definition, answers, visible };
}

/** FR-08.12: verifikasi boleh dibatalkan selama skor periode belum (atau tidak lagi) dipublikasikan. */
export function scoresPublished(period: { scoresPublishedAt: Date | null; scoresUnpublishedAt: Date | null }): boolean {
  return !!period.scoresPublishedAt && !(period.scoresUnpublishedAt && period.scoresUnpublishedAt > period.scoresPublishedAt);
}
