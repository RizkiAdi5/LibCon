import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";
import { logoutAction } from "@/lib/auth/actions";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["PARTICIPANT"]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-semibold">LibCon — {user.fullName}</span>
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
