import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";

// Menu Pengaturan khusus Super Admin (PRD §8). Server action di bawahnya tetap cek ulang sendiri.
export default async function PengaturanLayout({ children }: { children: ReactNode }) {
  await requireRole(["SUPER_ADMIN"]);
  return children;
}
