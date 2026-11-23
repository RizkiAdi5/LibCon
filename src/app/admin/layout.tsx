import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { DISABLE_SECOND_ACCOUNT } from "@/lib/validation/accountRequest";
import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup } from "@/components/shell/sidebar-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  // FR-05.03: badge jumlah permintaan yang menunggu (akun kedua + nonaktifkan akun kedua)
  const pendingRequests =
    (await prisma.accountRequest.count({ where: { status: "PENDING" } })) +
    (await prisma.institutionChangeRequest.count({ where: { status: "PENDING", changes: { path: ["type"], equals: DISABLE_SECOND_ACCOUNT } } }));
  // Pendaftaran mandiri lembaga — di luar PRD, fitur percobaan (lihat CLAUDE.md)
  const pendingRegistrations = await prisma.institutionRegistrationRequest.count({ where: { status: "PENDING" } });

  const groups: NavGroup[] = [
    [
      { href: "/admin/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/admin/periode", label: "Periode", icon: "CalendarRange" },
      { href: "/admin/kuesioner", label: "Kuesioner", icon: "ClipboardList" },
      { href: "/admin/verifikasi", label: "Verifikasi", icon: "ClipboardCheck" },
      { href: "/admin/skoring", label: "Skoring", icon: "Calculator" },
      { href: "/admin/report", label: "Report", icon: "BarChart3" },
      { href: "/admin/kunjungan", label: "Rekap Kunjungan", icon: "Users" },
    ],
    [
      { href: "/admin/peserta", label: "Peserta", icon: "Building2" },
      { href: "/admin/pendaftaran", label: "Pendaftaran Lembaga", icon: "FilePlus2", badge: pendingRegistrations },
      { href: "/admin/permintaan-akun", label: "Permintaan Akun", icon: "UserPlus", badge: pendingRequests },
    ],
    // Pengaturan & Log Aktivitas khusus Super Admin (halaman tetap dijaga requireRole sendiri)
    ...(user.role === "SUPER_ADMIN"
      ? [
          [
            { href: "/admin/pengaturan", label: "Pengaturan", icon: "Settings" },
            { href: "/admin/log-aktivitas", label: "Log Aktivitas", icon: "History" },
          ] satisfies NavGroup,
        ]
      : []),
  ];

  return (
    <AppShell title="LibCon Admin" user={{ name: user.fullName, role: user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin" }} groups={groups}>
      {children}
    </AppShell>
  );
}
