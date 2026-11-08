import { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "./client";
import { getRequestContext } from "./requestContext";

/**
 * Satu-satunya cara yang disetujui untuk menulis data. Membuka transaksi,
 * memasang `SET LOCAL app.user_id/app.request_id/app.ip/app.user_agent/app.source`
 * (dibaca trigger audit_logs di Tahap 3), lalu menjalankan `fn` dengan client
 * yang sama (created_by/updated_by tetap otomatis lewat extension di client.ts).
 */
export async function withDb<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const ctx = getRequestContext();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.request_id', ${ctx.requestId}, true),
      set_config('app.ip', ${ctx.ip ?? ""}, true),
      set_config('app.user_agent', ${ctx.userAgent ?? ""}, true),
      set_config('app.source', ${ctx.source}, true)`;
    return fn(tx as Db);
  });
}

export { Prisma };
