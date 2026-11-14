"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BarChart3,
  Building2,
  Calculator,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  History,
  Home,
  LayoutDashboard,
  Settings,
  UserCircle,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ikon dipetakan di klien: komponen tidak bisa dikirim dari server component sebagai prop
const ICONS = { Award, BarChart3, Building2, Calculator, CalendarRange, ClipboardCheck, ClipboardList, History, Home, LayoutDashboard, Settings, UserCircle, UserPlus };
export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; badge?: number };
export type NavGroup = NavItem[];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Menu kiri gaya Rubick: menu aktif = pil terang yang menyambung ke panel konten. */
export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu utama" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-6 lg:pl-4">
      {groups.map((group, gi) => (
        <div key={gi} className={cn("flex gap-1 lg:flex-col", gi > 0 && "lg:mt-3 lg:border-t lg:border-sidebar-border lg:pt-3")}>
          {group.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 whitespace-nowrap text-white/80 transition-colors hover:bg-white/10 hover:text-white",
                  "lg:rounded-r-none lg:rounded-l-full",
                  active && "bg-background font-medium text-brand hover:bg-background hover:text-brand",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {item.label}
                {!!item.badge && (
                  <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs leading-5 text-white" aria-label={`${item.badge} menunggu`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Breadcrumb topbar dari URL: "LibCon / <menu aktif>". */
export function Breadcrumb({ root, groups }: { root: string; groups: NavGroup[] }) {
  const pathname = usePathname();
  const current = groups.flat().find((i) => isActive(pathname, i.href));
  return (
    <p className="truncate text-sm text-muted-foreground">
      {root}
      {current && (
        <>
          <span className="mx-2 text-muted-foreground/60">/</span>
          <span className="font-medium text-foreground">{current.label}</span>
        </>
      )}
    </p>
  );
}
