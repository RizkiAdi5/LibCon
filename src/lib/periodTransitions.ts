import { prisma } from "./db/client";
import { withDb } from "./db/withDb";
import { effectiveClosesAt, nextAutoStatus } from "./period";

/**
 * FR-02.04: jalankan transisi status otomatis untuk semua periode. Dipanggil
 * cron (`/api/cron/period-status`) di dalam request context SYSTEM/CRON.
 * Tutup dulu baru buka, supaya periode baru bisa OPEN di run yang sama.
 */
export async function runPeriodTransitions(now = new Date()) {
  const periods = await prisma.surveyPeriod.findMany({
    where: { deletedAt: null, status: { in: ["DRAFT", "OPEN"] } },
    include: { periodExtensions: { where: { deletedAt: null } } },
    orderBy: { opensAt: "asc" },
  });

  const closed: string[] = [];
  for (const p of periods.filter((p) => nextAutoStatus(p, p.periodExtensions, now, false) === "CLOSED")) {
    await withDb((tx) => tx.surveyPeriod.update({ where: { id: p.id }, data: { status: "CLOSED" } }));
    closed.push(p.name);
  }

  const opened: string[] = [];
  const skipped: string[] = [];
  let anotherOpen = periods.some((p) => p.status === "OPEN" && !closed.includes(p.name));
  for (const p of periods.filter((p) => p.status === "DRAFT")) {
    const next = nextAutoStatus(p, p.periodExtensions, now, anotherOpen);
    if (next === "OPEN") {
      await withDb((tx) => tx.surveyPeriod.update({ where: { id: p.id }, data: { status: "OPEN" } }));
      opened.push(p.name);
      anotherOpen = true;
    } else if (anotherOpen && nextAutoStatus(p, p.periodExtensions, now, false) === "OPEN") {
      skipped.push(p.name); // FR-02.05: sudah ada periode OPEN lain
    }
  }

  if (skipped.length) console.warn(`[cron:period-status] tidak dibuka karena ada periode OPEN lain: ${skipped.join(", ")}`);
  return { opened, closed, skipped, notSubmitted: await markNotSubmitted(now) };
}

/**
 * BR-12: draf yang belum dikirim saat tenggat BERLAKU lembaga itu lewat (termasuk perpanjangan khusus
 * lembaga) → NOT_SUBMITTED. Lembaga tanpa baris kiriman tetap tanpa baris (monitoring menampilkannya
 * Tidak Mengisi). Bila kemudian diperpanjang, surveyMode tetap mengizinkan isi & autosave mengembalikan ke DRAFT.
 */
export async function markNotSubmitted(now = new Date()): Promise<number> {
  const drafts = await prisma.submission.findMany({
    where: { status: "DRAFT", period: { deletedAt: null, status: { in: ["OPEN", "CLOSED"] } } },
    select: { id: true, institutionId: true, period: { select: { closesAt: true, periodExtensions: { where: { deletedAt: null } } } } },
  });
  const ids = drafts.filter((d) => effectiveClosesAt(d.period.closesAt, d.period.periodExtensions, d.institutionId) <= now).map((d) => d.id);
  if (ids.length) await withDb((tx) => tx.submission.updateMany({ where: { id: { in: ids }, status: "DRAFT" }, data: { status: "NOT_SUBMITTED" } }));
  return ids.length;
}
