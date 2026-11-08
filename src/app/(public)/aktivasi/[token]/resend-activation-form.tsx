"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resendActivationAction, type ResendState } from "./actions";

const initialState: ResendState = {};

export function ResendActivationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resendActivationAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm text-muted-foreground">
        Kalau akun ditemukan, link aktivasi baru sudah dikirim ke email resmi lembaga.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Mengirim..." : "Minta link baru"}
      </Button>
    </form>
  );
}
