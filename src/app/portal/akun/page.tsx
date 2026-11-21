import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { getPasswordPolicy } from "@/lib/settings";
import { formatWib } from "@/lib/date";
import { canRequestSecondAccount, DISABLE_SECOND_ACCOUNT } from "@/lib/validation/accountRequest";
import { FlashMessage } from "@/components/flash-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requestDisableSecondAccountAction } from "./actions";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";
import { ChangePasswordForm } from "./change-password-form";
import { AccountRequestForm } from "./account-request-form";

export default async function PortalAkunPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole(["PARTICIPANT"]);
  const institutionId = user.institutionId!;
  const [sp, policy, institution, accounts, latestRequest, latestDisable] = await Promise.all([
    searchParams,
    getPasswordPolicy(),
    prisma.institution.findUniqueOrThrow({ where: { id: institutionId } }),
    prisma.user.findMany({ where: { institutionId, deletedAt: null }, orderBy: { isPrimary: "desc" } }),
    prisma.accountRequest.findFirst({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
    prisma.institutionChangeRequest.findFirst({ where: { institutionId, changes: { path: ["type"], equals: DISABLE_SECOND_ACCOUNT } }, orderBy: { createdAt: "desc" } }),
  ]);
  const hasPendingRequest = latestRequest?.status === "PENDING";
  const me = accounts.find((a) => a.id === user.id);
  const second = accounts.find((a) => !a.isPrimary && a.status !== "DISABLED");

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Akun</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />

      <section className="space-y-3">
        <h2 className="font-semibold">Akun lembaga</h2>
        <ul className="space-y-1 text-sm">
          {accounts.map((a) => (
            <li key={a.id}>
              {a.username} — {a.fullName} ({a.email}){" "}
              <span className={ACCOUNT_STATUS[a.status].className}>{ACCOUNT_STATUS[a.status].label}</span>
            </li>
          ))}
        </ul>

        {hasPendingRequest && (
          <p className="text-sm text-amber-700">
            Permintaan akun kedua untuk {latestRequest.fullName} sedang menunggu persetujuan admin (diajukan{" "}
            {formatWib(latestRequest.createdAt)}).
          </p>
        )}
        {latestRequest?.status === "REJECTED" && (
          <p className="text-sm text-destructive">
            Permintaan terakhir ditolak. Alasan: {latestRequest.rejectReason}
          </p>
        )}
        {canRequestSecondAccount({ accountCount: accounts.length, hasPendingRequest }) && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Ajukan akun tambahan</h3>
            <AccountRequestForm />
          </div>
        )}

        {/* FR-05.08: akun utama minta admin menonaktifkan akun kedua */}
        {latestDisable?.status === "PENDING" && (
          <p className="text-sm text-amber-700">Permintaan menonaktifkan akun kedua sedang menunggu admin (diajukan {formatWib(latestDisable.createdAt)}).</p>
        )}
        {latestDisable?.status === "REJECTED" && <p className="text-sm text-destructive">Permintaan menonaktifkan akun kedua ditolak. Catatan admin: {latestDisable.reviewNote}</p>}
        {me?.isPrimary && second && latestDisable?.status !== "PENDING" && (
          <form action={requestDisableSecondAccountAction} className="max-w-md space-y-2">
            <h3 className="text-sm font-medium">Minta nonaktifkan akun kedua ({second.username})</h3>
            <Label htmlFor="disableReason">Alasan</Label>
            <textarea id="disableReason" name="reason" required minLength={5} className="min-h-16 w-full rounded-md border p-2 text-sm" />
            <Button type="submit" variant="outline" size="sm">
              Kirim permintaan ke admin
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Ganti password</h2>
        <ChangePasswordForm policy={policy} npp={institution.npp ?? undefined} institutionName={institution.institutionName} />
      </section>
    </div>
  );
}
