import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { logoutAction } from "@/lib/auth/actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-semibold">LibCon Admin — {user.fullName}</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link href="/admin/peserta">Peserta</Link>
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
