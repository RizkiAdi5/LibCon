import type { UserStatus } from "@prisma/client";

// Prinsip UX PRD §8: status selalu warna + teks
export const ACCOUNT_STATUS: Record<UserStatus, { label: string; className: string }> = {
  PENDING_ACTIVATION: { label: "Belum aktivasi", className: "text-amber-700" },
  ACTIVE: { label: "Aktif", className: "text-green-700" },
  DISABLED: { label: "Dinonaktifkan", className: "text-destructive" },
};
