import { requireRole } from "@/lib/auth/guard";
import { getLockoutPolicy, getPasswordPolicy, getSessionPolicy } from "@/lib/settings";
import { FlashMessage } from "@/components/flash-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSecurityAction } from "../settings-actions";

function Num({ name, label, value, unit }: { name: string; label: string; value: number; unit?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={name} name={name} type="number" defaultValue={value} className="h-9 w-24" required />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} /> {label}
    </label>
  );
}

/** FR-14.03: kebijakan keamanan (Super Admin). */
export default async function KeamananPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const [sp, pw, lock, session] = await Promise.all([searchParams, getPasswordPolicy(), getLockoutPolicy(), getSessionPolicy()]);
  return (
    <form action={saveSecurityAction} className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Keamanan</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />

      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="px-1 font-medium">Password</legend>
        <Num name="password_policy.minLength" label="Panjang minimum" value={pw.minLength} unit="karakter" />
        <Check name="password_policy.requireUppercase" label="Wajib huruf besar" checked={pw.requireUppercase} />
        <Check name="password_policy.requireLowercase" label="Wajib huruf kecil" checked={pw.requireLowercase} />
        <Check name="password_policy.requireNumber" label="Wajib angka" checked={pw.requireNumber} />
        <Check name="password_policy.requireSymbol" label="Wajib simbol" checked={pw.requireSymbol} />
        <Check name="password_policy.forbidNppOrInstitutionName" label="Tidak boleh memuat NPP / nama lembaga" checked={pw.forbidNppOrInstitutionName} />
        <p className="text-xs text-muted-foreground">Berlaku untuk password baru; password lama tetap bisa dipakai.</p>
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium">Login gagal</legend>
        <Num name="lockout_policy.maxFailedAttempts" label="Gagal berturut-turut sebelum dikunci" value={lock.maxFailedAttempts} unit="kali" />
        <Num name="lockout_policy.lockoutMinutes" label="Lama kunci" value={lock.lockoutMinutes} unit="menit" />
        <Num name="lockout_policy.burstAttempts" label="Percobaan beruntun" value={lock.burstAttempts} unit="kali" />
        <Num name="lockout_policy.burstWindowMinutes" label="dalam jendela" value={lock.burstWindowMinutes} unit="menit" />
        <Num name="lockout_policy.burstLockMinutes" label="Lama kunci percobaan beruntun" value={lock.burstLockMinutes} unit="menit" />
        <Num name="lockout_policy.permanentBlockAfter" label="Blokir (buka oleh admin) setelah salah password" value={lock.permanentBlockAfter} unit="kali" />
        <Num name="lockout_policy.resetRequestsPerHour" label="Permintaan lupa password per akun" value={lock.resetRequestsPerHour} unit="per jam" />
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium">Sesi (sejak aktivitas terakhir)</legend>
        <Num name="session_policy.adminHours" label="Lama sesi admin" value={session.adminHours} unit="jam" />
        <Num name="session_policy.participantHours" label="Lama sesi peserta" value={session.participantHours} unit="jam" />
      </fieldset>

      <Button type="submit">Simpan</Button>
    </form>
  );
}
