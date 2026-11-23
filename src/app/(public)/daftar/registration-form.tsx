"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitRegistrationRequestAction, type RegistrationRequestState } from "./actions";
import type { TypeOption } from "@/app/admin/peserta/form-options";

const initialState: RegistrationRequestState = {};

export function RegistrationForm({ types }: { types: TypeOption[] }) {
  const [state, formAction, pending] = useActionState(submitRegistrationRequestAction, initialState);
  const values = state.values ?? {};
  const err = (name: keyof NonNullable<RegistrationRequestState["fieldErrors"]>) =>
    state.fieldErrors?.[name]?.[0] && (
      <p role="alert" className="text-sm text-destructive">
        {state.fieldErrors[name]![0]}
      </p>
    );

  if (state.success) {
    return (
      <div className="space-y-2 rounded-md bg-green-50 p-4 text-sm text-green-800">
        <p className="font-medium">Pendaftaran terkirim.</p>
        <p>Tim Perpustakaan Kota akan meninjau pengajuan ini. Email aktivasi dikirim ke alamat yang kamu daftarkan setelah disetujui.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="institutionName">Nama sekolah/lembaga</Label>
        <Input id="institutionName" name="institutionName" defaultValue={values.institutionName} maxLength={200} required />
        {err("institutionName")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="typeId">Jenis peserta</Label>
        <select
          id="typeId"
          name="typeId"
          defaultValue={values.typeId ?? ""}
          className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-sm shadow-xs"
          required
        >
          <option value="">— Pilih jenis —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {err("typeId")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="officialEmail">Email resmi lembaga</Label>
        <Input id="officialEmail" name="officialEmail" type="email" defaultValue={values.officialEmail} required />
        {err("officialEmail")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="picName">Nama penanggung jawab</Label>
        <Input id="picName" name="picName" defaultValue={values.picName} required />
        {err("picName")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp">WhatsApp (opsional)</Label>
        <Input id="whatsapp" name="whatsapp" placeholder="62xxxxxxxxxx" defaultValue={values.whatsapp} />
        {err("whatsapp")}
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Mengirim..." : "Kirim pendaftaran"}
      </Button>
    </form>
  );
}
