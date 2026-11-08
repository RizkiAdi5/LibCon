import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth/sessionCookie";

/**
 * Proxy (dulu "middleware", di-rename Next.js 16) berjalan di Edge runtime
 * (tidak bisa akses Prisma/argon2 native binding), jadi HANYA melakukan
 * redirect cepat kalau cookie sesi sama sekali tidak ada — murni kenyamanan
 * UX. Pengecekan otoritatif (sesi valid? peran cocok?) selalu di
 * `requireRole()` (Node runtime) di setiap layout admin/portal dan di setiap
 * server action — lihat src/lib/auth/guard.ts dan CLAUDE.md.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/admin") || pathname.startsWith("/portal");
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
