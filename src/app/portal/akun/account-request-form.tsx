"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestSecondAccountAction, type AccountRequestState } from "./actions";

const initialState: AccountRequestState = {};

export function AccountRequestForm() {
  const [state, formAction, pending] = useActionState(requestSecondAccountAction, initialState);

  if (state.success) {
    return (
      <p role="status" className="text-sm text-green-700">
        Permintaan terkirim. Admin akan meninjau, lalu email aktivasi dikirim ke email pengisi kedua.
      </p>
    );
  }

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Nama lengkap pengisi kedua</Label>
        <Input id="fullName" name="fullName" maxLength={200} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email pengisi kedua</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">Alasan</Label>
        <textarea id="reason" name="reason" required className="min-h-20 w-full rounded-md border p-2 text-sm" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Mengirim..." : "Ajukan akun tambahan"}
      </Button>
    </form>
  );
}
