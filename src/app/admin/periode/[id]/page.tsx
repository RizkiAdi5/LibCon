import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib, toWibInputValue } from "@/lib/date";
import { effectiveClosesAt, MANUAL_TRANSITIONS, PERIOD_STATUS } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { addExtensionAction, copyPeriodAction, setPeriodStatusAction } from "../actions";
import { PeriodForm } from "../period-form";

const STATUS_ACTION_LABEL = { DRAFT: "", OPEN: "Buka periode", CLOSED: "Tutup periode", ARCHIVED: "Arsipkan" } as const;
const STATUS_IMPACT = {
  CLOSED: "Peserta tidak bisa lagi mengirim survei, kecuali lembaga yang diperpanjang.",
  ARCHIVED: "Periode diarsipkan dan tidak bisa diubah atau dibuka lagi.",
} as const;

export default async function DetailPeriodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const period = await prisma.surveyPeriod.findFirst({
    where: { id, deletedAt: null },
    include: {
      copiedFrom: true,
      periodExtensions: { where: { deletedAt: null }, include: { institution: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!period) notFound();

  const canEdit = user.role === "SUPER_ADMIN" && period.status !== "ARCHIVED";
  const institutions = canEdit
    ? await prisma.institution.findMany({ where: { deletedAt: null }, orderBy: { libraryName: "asc" } })
    : [];
  const generalClose = effectiveClosesAt(period.closesAt, period.periodExtensions, null);

  return (
    <div className="space-y-8">
      <Link href="/admin/periode" className="text-sm underline">
        ← Daftar periode
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{period.name}</h1>
        <p className="text-sm">
          Status: <span className={PERIOD_STATUS[period.status].className}>{PERIOD_STATUS[period.status].label}</span>{" "}
          · Buka {formatWib(period.opensAt)} · Tutup {formatWib(period.closesAt)}
          {generalClose > period.closesAt && <> (diperpanjang semua lembaga sampai {formatWib(generalClose)})</>}
        </p>
        {period.copiedFrom && <p className="text-sm text-muted-foreground">Salinan dari {period.copiedFrom.name}</p>}
      </div>
      <FlashMessage ok={ok} error={error} />

      {user.role === "SUPER_ADMIN" && MANUAL_TRANSITIONS[period.status].length > 0 && (
        <section className="flex flex-wrap items-start gap-3">
          {MANUAL_TRANSITIONS[period.status].map((status) =>
            status === "OPEN" ? (
              <form key={status} action={setPeriodStatusAction}>
                <input type="hidden" name="id" value={period.id} />
                <input type="hidden" name="status" value={status} />
                <Button type="submit">{STATUS_ACTION_LABEL[status]}</Button>
              </form>
            ) : (
              <ConfirmAction
                key={status}
                action={setPeriodStatusAction}
                fields={{ id: period.id, status }}
                label={STATUS_ACTION_LABEL[status]}
                confirmLabel={`Ya, ${STATUS_ACTION_LABEL[status].toLowerCase()}`}
                impact={STATUS_IMPACT[status as keyof typeof STATUS_IMPACT]}
              />
            ),
          )}
        </section>
      )}

      {canEdit ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Pengaturan periode</h2>
          <PeriodForm
            opensAtLocked={period.status !== "DRAFT"}
            initial={{
              id: period.id,
              name: period.name,
              year: String(period.year),
              opensAt: toWibInputValue(period.opensAt),
              closesAt: toWibInputValue(period.closesAt),
              passingScore: period.passingScore.toString(),
              revisionDeadlineDays: String(period.revisionDeadlineDays),
              revisionScope: period.revisionScope,
              showRankingToParticipants: period.showRankingToParticipants ? "on" : "",
            }}
          />
        </section>
      ) : (
        <section className="space-y-1 text-sm">
          <h2 className="font-semibold">Pengaturan periode</h2>
          <p>Batas lolos: {new Intl.NumberFormat("id-ID").format(Number(period.passingScore))}</p>
          <p>Lama batas revisi: {period.revisionDeadlineDays} hari</p>
          <p>Cakupan revisi: {period.revisionScope === "ALL" ? "Semua soal" : "Soal terpilih"}</p>
          <p>Ranking ke peserta: {period.showRankingToParticipants ? "Ditampilkan" : "Disembunyikan"}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Perpanjangan tenggat</h2>
        {period.periodExtensions.length === 0 && <p className="text-sm text-muted-foreground">Belum ada perpanjangan.</p>}
        <ul className="space-y-1 text-sm">
          {period.periodExtensions.map((e) => (
            <li key={e.id}>
              Sampai {formatWib(e.newClosesAt)} — {e.institution?.libraryName ?? "Semua lembaga"} — {e.reason}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form action={addExtensionAction} className="max-w-xl space-y-3 rounded-md border p-4">
            <input type="hidden" name="periodId" value={period.id} />
            <div className="space-y-1">
              <Label htmlFor="newClosesAt">Perpanjang sampai (WIB)</Label>
              <Input id="newClosesAt" name="newClosesAt" type="datetime-local" required />
            </div>
            <fieldset className="space-y-1 text-sm">
              <legend>Berlaku untuk</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="ALL" defaultChecked /> Semua lembaga
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="SELECTED" /> Lembaga terpilih:
              </label>
              <select
                name="institutionIds"
                multiple
                aria-label="Lembaga yang diperpanjang"
                className="h-32 w-full rounded-md border p-1"
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.npp} — {i.libraryName}
                  </option>
                ))}
              </select>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="reason">Alasan</Label>
              <textarea id="reason" name="reason" required className="min-h-16 w-full rounded-md border p-2 text-sm" />
            </div>
            <Button type="submit" variant="outline">
              Simpan perpanjangan
            </Button>
          </form>
        )}
      </section>

      {user.role === "SUPER_ADMIN" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Salin periode</h2>
          <p className="text-sm text-muted-foreground">
            Hasil salinan berstatus Draf dengan pengaturan dan kuesioner (bagian, soal, aturan, logika tampil) yang sama;
            jawaban tidak ikut. Skema skor akan ikut tersalin setelah modul Skoring tersedia.
          </p>
          <form action={copyPeriodAction} className="grid max-w-3xl gap-3 rounded-md border p-4 md:grid-cols-2">
            <input type="hidden" name="sourceId" value={period.id} />
            <div className="space-y-1">
              <Label htmlFor="copyName">Nama periode baru</Label>
              <Input id="copyName" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="copyYear">Tahun</Label>
              <Input id="copyYear" name="year" type="number" defaultValue={period.year + 1} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="copyOpensAt">Tanggal-jam buka baru (WIB)</Label>
              <Input id="copyOpensAt" name="opensAt" type="datetime-local" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="copyClosesAt">Tanggal-jam tutup baru (WIB)</Label>
              <Input id="copyClosesAt" name="closesAt" type="datetime-local" required />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="outline">
                Salin periode
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
