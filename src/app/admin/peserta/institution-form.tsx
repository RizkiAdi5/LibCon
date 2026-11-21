"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InstitutionFieldErrors } from "@/lib/validation/institution";
import { saveInstitutionAction, type InstitutionFormState } from "./actions";
import type { DistrictOption, TypeOption } from "./form-options";

const initialState: InstitutionFormState = {};
const selectClass = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

function Field({
  name,
  label,
  required,
  errors,
  children,
}: {
  name: keyof InstitutionFieldErrors;
  label: string;
  required?: boolean;
  errors?: InstitutionFieldErrors;
  children: ReactNode;
}) {
  const error = errors?.[name]?.[0];
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>
        {label}
        {required && <span aria-hidden> *</span>}
      </Label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function InstitutionForm({
  districts,
  types,
  initial,
  canEditNpp,
  action = saveInstitutionAction,
  participant = false,
}: {
  districts: DistrictOption[];
  types: TypeOption[];
  initial?: Record<string, string>;
  canEditNpp: boolean;
  action?: (prev: InstitutionFormState, formData: FormData) => Promise<InstitutionFormState>;
  /** Peserta melengkapi profil sendiri: jenis & email login ditetapkan admin (server juga mengabaikannya). */
  participant?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initial ?? {};
  const [districtId, setDistrictId] = useState(values.districtId ?? "");
  const villages = districts.find((d) => d.id === districtId)?.villages ?? [];
  const errors = state.fieldErrors;
  const describe = (name: keyof InstitutionFieldErrors) =>
    errors?.[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {};

  return (
    // key: React 19 me-reset form setelah action — remount supaya isian terakhir tetap tampil saat ada error
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field name="npp" label="NPP (Nomor Pokok Perpustakaan)" required errors={errors}>
        <Input id="npp" name="npp" inputMode="numeric" defaultValue={values.npp} readOnly={!canEditNpp} required {...describe("npp")} />
      </Field>
      <Field name="npsn" label="NPSN (untuk sekolah)" errors={errors}>
        <Input id="npsn" name="npsn" inputMode="numeric" defaultValue={values.npsn} {...describe("npsn")} />
      </Field>
      <Field name="libraryName" label="Nama perpustakaan" required errors={errors}>
        <Input id="libraryName" name="libraryName" maxLength={200} defaultValue={values.libraryName} required {...describe("libraryName")} />
      </Field>
      <Field name="institutionName" label="Nama instansi/lembaga" required errors={errors}>
        <Input id="institutionName" name="institutionName" maxLength={200} defaultValue={values.institutionName} required {...describe("institutionName")} />
      </Field>
      <Field name="typeId" label="Jenis peserta" required errors={errors}>
        <select id="typeId" name="typeId" defaultValue={values.typeId ?? ""} className={selectClass} required disabled={participant} {...describe("typeId")}>
          <option value="">— Pilih jenis —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div />
      <Field name="districtId" label="Kecamatan" required errors={errors}>
        <select
          id="districtId"
          name="districtId"
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
          className={selectClass}
          required
          {...describe("districtId")}
        >
          <option value="">— Pilih kecamatan —</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="villageId" label="Kelurahan" required errors={errors}>
        <select
          key={districtId}
          id="villageId"
          name="villageId"
          defaultValue={values.districtId === districtId ? values.villageId : ""}
          className={selectClass}
          required
          disabled={!districtId}
          {...describe("villageId")}
        >
          <option value="">{districtId ? "— Pilih kelurahan —" : "Pilih kecamatan dulu"}</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field name="address" label="Alamat" required errors={errors}>
          <Input id="address" name="address" defaultValue={values.address} required {...describe("address")} />
        </Field>
      </div>
      <Field name="headName" label="Nama kepala lembaga" errors={errors}>
        <Input id="headName" name="headName" defaultValue={values.headName} {...describe("headName")} />
      </Field>
      <Field name="picName" label="Nama penanggung jawab/pengisi" required errors={errors}>
        <Input id="picName" name="picName" defaultValue={values.picName} required {...describe("picName")} />
      </Field>
      <Field name="officialEmail" label="Email resmi" required errors={errors}>
        <Input id="officialEmail" name="officialEmail" type="email" defaultValue={values.officialEmail} required readOnly={participant} {...describe("officialEmail")} />
      </Field>
      <Field name="whatsapp" label="Nomor WhatsApp (62xxxxxxxxxx)" errors={errors}>
        <Input id="whatsapp" name="whatsapp" inputMode="numeric" defaultValue={values.whatsapp} {...describe("whatsapp")} />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-destructive md:col-span-2">
          {state.error}
        </p>
      )}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : participant ? "Simpan & lanjutkan" : "Simpan lembaga"}
        </Button>
      </div>
    </form>
  );
}
