import type { SubmissionStatus } from "@/generated/prisma/client";

// Label status kiriman (flowchart §12) — selalu warna + teks (PRD §8)
export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: "Belum Mengisi", className: "text-muted-foreground" },
  DRAFT: { label: "Draf", className: "text-amber-700" },
  SUBMITTED: { label: "Terkirim", className: "text-green-700" },
  NEEDS_REVISION: { label: "Perlu Revisi", className: "text-destructive" },
  VERIFIED: { label: "Terverifikasi", className: "text-green-700" },
  NOT_SUBMITTED: { label: "Tidak Mengisi", className: "text-destructive" },
};
