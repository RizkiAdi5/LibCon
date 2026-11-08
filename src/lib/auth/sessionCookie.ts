/**
 * File terpisah TANPA import lain — dipakai middleware.ts (Edge runtime,
 * tidak bisa import Prisma/argon2) dan session.ts (Node runtime) sekaligus.
 */
export const SESSION_COOKIE_NAME = "libcon_session";
