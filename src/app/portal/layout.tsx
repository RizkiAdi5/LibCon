import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { logoutAction } from "@/lib/auth/actions";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["PARTICIPANT"]);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <span className="font-semibold">LibCon — {user.fullName}</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/portal/beranda">Beranda</Link>
          <Link href="/portal/survei">Survei</Link>
          <Link href="/portal/akun">Akun</Link>
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
