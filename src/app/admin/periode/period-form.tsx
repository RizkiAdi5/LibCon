"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePeriodAction, type PeriodFormState } from "./actions";

const initialState: PeriodFormState = {};

export function PeriodForm({ initial, opensAtLocked }: { initial?: Record<string, string>; opensAtLocked?: boolean }) {
  const [state, formAction, pending] = useActionState(savePeriodAction, initialState);
  const v = state.values ?? initial ?? {};
  const error = (name: string) => state.fieldErrors?.[name]?.[0];
  const field = (name: string, label: string, input: React.ReactNode) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      {input}
      {error(name) && <p className="text-sm text-destructive">{error(name)}</p>}
    </div>
  );

  return (
    // key: React 19 me-reset form setelah action — remount supaya isian terakhir tetap tampil saat ada error
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {field("name", "Nama periode", <Input id="name" name="name" defaultValue={v.name} maxLength={200} required />)}
      {field("year", "Tahun", <Input id="year" name="year" type="number" defaultValue={v.year} required />)}
      {field(
        "opensAt",
        "Tanggal-jam buka (WIB)",
        <Input id="opensAt" name="opensAt" type="datetime-local" defaultValue={v.opensAt} readOnly={opensAtLocked} required />,
      )}
      {field(
        "closesAt",
        "Tanggal-jam tutup (WIB)",
        <Input id="closesAt" name="closesAt" type="datetime-local" defaultValue={v.closesAt} required />,
      )}
      {field(
        "passingScore",
        "Batas lolos",
        <Input id="passingScore" name="passingScore" type="number" step="0.01" min={0} defaultValue={v.passingScore ?? "70"} required />,
      )}
      {field(
        "revisionDeadlineDays",
        "Lama batas revisi (hari)",
        <Input id="revisionDeadlineDays" name="revisionDeadlineDays" type="number" min={1} defaultValue={v.revisionDeadlineDays ?? "7"} required />,
      )}
      {field(
        "revisionScope",
        "Cakupan revisi",
        <select id="revisionScope" name="revisionScope" defaultValue={v.revisionScope ?? "SELECTED_QUESTIONS"} className="h-9 w-full rounded-md border px-2 text-sm">
          <option value="SELECTED_QUESTIONS">Soal terpilih</option>
          <option value="ALL">Semua soal</option>
        </select>,
      )}
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="showRankingToParticipants" defaultChecked={v.showRankingToParticipants === "on"} />
        Tampilkan ranking ke peserta
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive md:col-span-2">
          {state.error}
        </p>
      )}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan periode"}
        </Button>
      </div>
    </form>
  );
}
