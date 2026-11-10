import { prisma } from "./db/client";
import { withDb } from "./db/withDb";
import { nextAutoStatus } from "./period";

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
  return { opened, closed, skipped };
}
