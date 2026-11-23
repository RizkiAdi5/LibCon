"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { PasswordRules } from "@/components/password-rules";
import { checkPasswordPolicy } from "@/lib/auth/passwordPolicy";
import type { PasswordPolicy } from "@/lib/settings";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm({
  policy,
  npp,
  institutionName,
}: {
  policy: PasswordPolicy;
  npp?: string;
  institutionName?: string;
}) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const [password, setPassword] = useState("");
  const check = checkPasswordPolicy(password, policy, { npp, institutionName });

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="oldPassword">Password lama</Label>
        <PasswordInput id="oldPassword" name="oldPassword" autoComplete="current-password" required />
      </div>
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
        <Label htmlFor="passwordConfirmation">Konfirmasi password baru</Label>
        <PasswordInput id="passwordConfirmation" name="passwordConfirmation" autoComplete="new-password" required />
      </div>
      <PasswordRules failedRules={check.failedRules} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-green-700">
          Password berhasil diganti. Sesi di perangkat lain sudah diakhiri.
        </p>
      )}
      <Button type="submit" disabled={pending || !check.valid}>
        {pending ? "Menyimpan..." : "Ganti password"}
      </Button>
    </form>
  );
}
