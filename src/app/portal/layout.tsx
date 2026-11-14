import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["PARTICIPANT"]);

  return (
    <AppShell
      title="LibCon"
      user={{ name: user.fullName, role: `Peserta · ${user.username}` }}
      groups={[
        [
          { href: "/portal/beranda", label: "Beranda", icon: "Home" },
          { href: "/portal/survei", label: "Survei", icon: "ClipboardList" },
          { href: "/portal/skor-saya", label: "Skor Saya", icon: "Award" },
          { href: "/portal/akun", label: "Akun", icon: "UserCircle" },
        ],
      ]}
    >
      {children}
    </AppShell>
  );
}
