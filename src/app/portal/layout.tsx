import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  // setiap halaman portal memanggil requireRole sendiri (tanpa allowSetup) → diarahkan ke /portal/mulai
  const user = await requireRole(["PARTICIPANT"], { allowSetup: true });

  return (
    <AppShell
      title="LibCon"
      user={{ name: user.fullName, role: `Peserta · ${user.username}` }}
      groups={
        user.setup
          ? [[{ href: "/portal/mulai", label: "Mulai", icon: "UserCircle" }]]
          : [
              [
                { href: "/portal/beranda", label: "Beranda", icon: "Home" },
                { href: "/portal/survei", label: "Survei", icon: "ClipboardList" },
                { href: "/portal/kunjungan", label: "Rekap Kunjungan", icon: "Users" },
                { href: "/portal/skor-saya", label: "Skor Saya", icon: "Award" },
                { href: "/portal/akun", label: "Akun", icon: "UserCircle" },
              ],
            ]
      }
    >
      {children}
    </AppShell>
  );
}
