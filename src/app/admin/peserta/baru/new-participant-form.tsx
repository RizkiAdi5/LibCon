"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRules } from "@/components/password-rules";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import type { PasswordPolicy } from "@/lib/settings";
import { createParticipantAccountAction, type NewParticipantState } from "../actions";
import type { TypeOption } from "../form-options";

const initialState: NewParticipantState = {};
const selectClass = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

/** Password acak yang memenuhi kebijakan umum (huruf besar, kecil, angka, simbol). */
function randomPassword(length: number): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = sets.map(pick);
  while (chars.length < Math.max(length, 12)) chars.push(pick(all));
  return chars.sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5).join("");
}

export function NewParticipantForm({ types, policy }: { types: TypeOption[]; policy: PasswordPolicy }) {
  const [state, formAction, pending] = useActionState(createParticipantAccountAction, initialState);
  const values = state.values ?? {};
  const [password, setPassword] = useState("");
  const [institutionName, setInstitutionName] = useState(values.institutionName ?? "");
  const check = checkPasswordPolicy(password, policy, { institutionName });
  const errors = state.fieldErrors;
  const err = (name: keyof NonNullable<NewParticipantState["fieldErrors"]>) =>
    errors?.[name]?.[0] && <p className="text-sm text-destructive">{errors[name]![0]}</p>;

  return (
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="box max-w-xl space-y-4 p-5">
      <div className="space-y-1">
        <Label htmlFor="institutionName">Nama sekolah/lembaga *</Label>
        <Input
          id="institutionName"
          name="institutionName"
          maxLength={200}
          defaultValue={values.institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          required
        />
        {err("institutionName")}
      </div>
      <div className="space-y-1">
        <Label htmlFor="typeId">Jenis peserta *</Label>
        <select id="typeId" name="typeId" defaultValue={values.typeId ?? ""} className={selectClass} required>
          <option value="">— Pilih jenis —</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {err("typeId")}
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email (dipakai untuk login) *</Label>
        <Input id="email" name="email" type="email" autoComplete="off" defaultValue={values.email} required />
        {err("email")}
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password awal *</Label>
        <div className="flex gap-2">
          <Input
            id="password"
            name="password"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="button" variant="outline" onClick={() => setPassword(randomPassword(policy.minLength + 2))}>
            Buat acak
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Catat dan berikan ke lembaga. Peserta wajib mengganti password ini saat login pertama.
        </p>
        {err("password")}
      </div>
      <PasswordRules failedRules={check.failedRules} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || !check.valid}>
        {pending ? "Menyimpan..." : "Buat akun"}
      </Button>
    </form>
  );
}
