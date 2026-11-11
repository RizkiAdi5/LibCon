"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitSurveyAction, type SubmitState } from "../actions";

/** FR-07.09: konfirmasi pernyataan data benar + nama pengisi. AC M07: nonaktif selama ada Blokir. */
export function SubmitForm({ periodId, blocked }: { periodId: string; blocked: boolean }) {
  const [state, formAction, pending] = useActionState(submitSurveyAction, {} as SubmitState);
  return (
    <form action={formAction} className="max-w-xl space-y-3 rounded-md border p-4">
      <input type="hidden" name="periodId" value={periodId} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1" required />
        Saya menyatakan data yang diisi sudah benar dan dapat dipertanggungjawabkan. Setelah dikirim, jawaban terkunci.
      </label>
      {state.fieldErrors?.confirm && <p className="text-sm text-destructive">{state.fieldErrors.confirm}</p>}
      <div className="space-y-1">
        <Label htmlFor="submitterName">Nama pengisi</Label>
        <Input id="submitterName" name="submitterName" maxLength={200} required />
        {state.fieldErrors?.submitterName && <p className="text-sm text-destructive">{state.fieldErrors.submitterName}</p>}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={blocked || pending}>
        {pending ? "Mengirim..." : "Kirim survei"}
      </Button>
      {blocked && <p className="text-sm text-muted-foreground">Perbaiki semua masalah di atas dulu, lalu tombol Kirim aktif.</p>}
    </form>
  );
}
