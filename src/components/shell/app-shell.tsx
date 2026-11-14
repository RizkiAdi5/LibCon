import type { ReactNode } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { Breadcrumb, SidebarNav, type NavGroup } from "./sidebar-nav";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * Kerangka gaya Rubick: latar biru (sidebar menyatu), panel konten abu muda bersudut besar
 * dengan topbar (breadcrumb + pengguna + keluar). Dipakai panel admin & portal peserta.
 */
export function AppShell({ title, user, groups, children }: { title: string; user: { name: string; role: string }; groups: NavGroup[]; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand lg:flex">
      <aside className="shrink-0 text-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-5 lg:py-7">
          {/* logo teal dijadikan putih supaya terbaca di latar biru */}
          <Image src="/logo-libcon.png" alt="" width={36} height={27} className="brightness-0 invert" priority />
          <span className="text-lg font-medium tracking-wide">{title}</span>
        </div>
        <SidebarNav groups={groups} />
      </aside>

      <div className="app-panel min-w-0 flex-1 rounded-t-[30px] bg-background lg:my-2.5 lg:mr-2.5 lg:rounded-[30px]">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 lg:px-8">
          <Breadcrumb root="LibCon" groups={groups} />
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand text-xs font-medium text-white">
              {initials(user.name)}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground">
                <LogOut className="size-4" aria-hidden />
                Keluar
              </button>
            </form>
          </div>
        </header>
        <main className="px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
