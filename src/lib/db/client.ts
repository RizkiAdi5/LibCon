import { PrismaClient } from "@/generated/prisma/client";
import { withCreatedBy, withUpdatedBy } from "./trackingFields";

// Singleton aman untuk hot-reload Next.js dev (lihat Prisma docs "best practice").
const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

const prismaBase = globalForPrisma.prismaBase ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = prismaBase;
}

/**
 * Client Prisma dengan kolom created_by/updated_by/deleted_by ditimpa ulang
 * dari request context sebelum setiap create/update/upsert (FR-13.02) — jaring
 * pengaman, BUKAN pengganti mengisinya di call site. `createdBy` tetap wajib
 * ditulis manual (`createdBy: ctx.userId`) karena NOT NULL tanpa default DB;
 * TypeScript akan menolak compile kalau lupa. HANYA untuk baca di luar
 * write-path (`findMany`, dst).
 *
 * Untuk menulis data, JANGAN panggil model ini langsung — pakai `withDb()`
 * dari `./withDb`. Alasan: audit_logs butuh `SET LOCAL app.user_id` yang
 * cuma bisa dipasang di dalam transaksi eksplisit; memanggil `prisma.x.create()`
 * langsung tetap mengisi kolom created_by dengan benar, tapi baris di
 * audit_logs akan tercatat tanpa aktor (actor_role jatuh ke SYSTEM).
 */
export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async create({ args, query }) {
        // Cast: tipe union args.data lintas 44 model terlalu kompleks untuk
        // dicocokkan lewat helper generik — payload sesungguhnya tetap valid
        // (hanya menambah createdBy), diverifikasi lewat unit test helper ini.
        args.data = withCreatedBy(args.data as Record<string, unknown>) as typeof args.data;
        return query(args);
      },
      async createMany({ args, query }) {
        const list = Array.isArray(args.data) ? args.data : [args.data];
        args.data = list.map(
          (row) => withCreatedBy(row as Record<string, unknown>) as typeof list[number],
        ) as typeof args.data;
        return query(args);
      },
      async update({ args, query }) {
        args.data = withUpdatedBy(args.data as Record<string, unknown>) as typeof args.data;
        return query(args);
      },
      async updateMany({ args, query }) {
        args.data = withUpdatedBy(args.data as Record<string, unknown>) as typeof args.data;
        return query(args);
      },
      async upsert({ args, query }) {
        args.create = withCreatedBy(args.create as Record<string, unknown>) as typeof args.create;
        args.update = withUpdatedBy(args.update as Record<string, unknown>) as typeof args.update;
        return query(args);
      },
    },
  },
});

export type Db = typeof prisma;
