import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { logoutAction } from "@/lib/auth/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const pendingRequests = await prisma.accountRequest.count({ where: { status: "PENDING" } });

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-semibold">LibCon Admin — {user.fullName}</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link href="/admin/periode">Periode</Link>
          <Link href="/admin/kuesioner">Kuesioner</Link>
          <Link href="/admin/verifikasi">Verifikasi</Link>
          <Link href="/admin/skoring">Skoring</Link>
          <Link href="/admin/report">Report</Link>
          <Link href="/admin/peserta">Peserta</Link>
          <Link href="/admin/permintaan-akun">
            Permintaan Akun
            {pendingRequests > 0 && (
              // FR-05.03: badge jumlah yang menunggu
              <span className="ml-1 rounded-full bg-destructive px-1.5 text-xs text-white">{pendingRequests}</span>
            )}
          </Link>
          {user.role === "SUPER_ADMIN" && (
            <>
              <Link href="/admin/pengaturan/wilayah">Wilayah</Link>
              <Link href="/admin/pengaturan/jenis-peserta">Jenis Peserta</Link>
            </>
          )}
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">
            Keluar
          </button>
        </form>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
