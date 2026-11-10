import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { getPasswordPolicy } from "@/lib/settings";
import { formatWib } from "@/lib/date";
import { canRequestSecondAccount } from "@/lib/validation/accountRequest";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";
import { ChangePasswordForm } from "./change-password-form";
import { AccountRequestForm } from "./account-request-form";

export default async function PortalAkunPage() {
  const user = await requireRole(["PARTICIPANT"]);
  const institutionId = user.institutionId!;
  const [policy, institution, accounts, latestRequest] = await Promise.all([
    getPasswordPolicy(),
    prisma.institution.findUniqueOrThrow({ where: { id: institutionId } }),
    prisma.user.findMany({ where: { institutionId, deletedAt: null }, orderBy: { isPrimary: "desc" } }),
    prisma.accountRequest.findFirst({ where: { institutionId }, orderBy: { createdAt: "desc" } }),
  ]);
  const hasPendingRequest = latestRequest?.status === "PENDING";

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Akun</h1>

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
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Ganti password</h2>
        <ChangePasswordForm policy={policy} npp={institution.npp} institutionName={institution.institutionName} />
      </section>
    </div>
  );
}
