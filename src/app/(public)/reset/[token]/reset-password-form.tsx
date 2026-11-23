"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { PasswordRules } from "@/components/password-rules";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import type { PasswordPolicy } from "@/lib/settings";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirmation">Konfirmasi password</Label>
        <PasswordInput id="passwordConfirmation" name="passwordConfirmation" autoComplete="new-password" required />
      </div>
      <PasswordRules failedRules={check.failedRules} />
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
