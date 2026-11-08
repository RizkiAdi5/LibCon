"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPasswordPolicy, type PasswordRuleId } from "@/lib/auth/passwordPolicy";
import type { PasswordPolicy } from "@/lib/settings";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const RULE_LABELS: Record<PasswordRuleId, string> = {
  minLength: "Minimal 10 karakter",
  uppercase: "Mengandung huruf besar",
  lowercase: "Mengandung huruf kecil",
  number: "Mengandung angka",
  symbol: "Mengandung simbol",
  noNppOrInstitutionName: "Tidak memuat NPP/nama lembaga",
  notCommon: "Bukan password umum",
};

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token, policy }: { token: string; policy: PasswordPolicy }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [password, setPassword] = useState("");
  const check = checkPasswordPolicy(password, policy);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirmation">Konfirmasi password</Label>
        <Input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <ul className="space-y-1 text-sm">
        {(Object.keys(RULE_LABELS) as PasswordRuleId[]).map((rule) => (
          <li
            key={rule}
            className={check.failedRules.includes(rule) ? "text-muted-foreground" : "text-green-600"}
          >
            {check.failedRules.includes(rule) ? "○" : "✓"} {RULE_LABELS[rule]}
          </li>
        ))}
      </ul>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending || !check.valid}>
        {pending ? "Memproses..." : "Simpan password baru"}
      </Button>
    </form>
  );
}
