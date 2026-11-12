import { requireRole } from "@/lib/auth/guard";
import { getIdentity } from "@/lib/settings";
import { getIplmIdentity } from "@/lib/reportData";
import { FlashMessage } from "@/components/flash-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveIdentityAction } from "../settings-actions";

function Field({ name, label, value, type = "text", hint }: { name: string; label: string; value: string; type?: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={value} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** FR-14.04: identitas penyelenggara (tampil di rapor PDF) + identitas ekspor IPLM. */
export default async function IdentitasPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const [sp, id, iplm] = await Promise.all([searchParams, getIdentity(), getIplmIdentity()]);
  return (
    <form action={saveIdentityAction} className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Identitas</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />
      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-1 font-medium">Penyelenggara</legend>
        <Field name="identity.libraryName" label="Nama Perpustakaan Kota" value={id.libraryName} />
        <Field name="identity.address" label="Alamat" value={id.address} />
        <Field name="identity.senderEmail" label="Email balasan (reply-to)" type="email" value={id.senderEmail} hint="Alamat pengirim resmi tetap dari konfigurasi server (domain harus terverifikasi, PRD Q6)." />
        <Field name="identity.signerName" label="Nama penanda tangan rapor" value={id.signerName} />
        <Field name="identity.signerTitle" label="Jabatan penanda tangan" value={id.signerTitle} />
      </fieldset>
      <fieldset className="space-y-3 rounded-md border p-4">
        <legend className="px-1 font-medium">Ekspor IPLM</legend>
        <Field name="iplm_export.provinsi" label="Provinsi" value={iplm.provinsi} />
        <Field name="iplm_export.kewNorm" label="KEW_NORM" value={iplm.kewNorm} />
      </fieldset>
      <Button type="submit">Simpan</Button>
    </form>
  );
}
