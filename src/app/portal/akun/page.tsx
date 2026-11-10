import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { getPasswordPolicy } from "@/lib/settings";
import { ChangePasswordForm } from "./change-password-form";

export default async function PortalAkunPage() {
  const user = await requireRole(["PARTICIPANT"]);
  const [policy, institution] = await Promise.all([
    getPasswordPolicy(),
    prisma.institution.findUniqueOrThrow({ where: { id: user.institutionId! } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Akun</h1>
      <section className="space-y-3">
        <h2 className="font-semibold">Ganti password</h2>
        <ChangePasswordForm policy={policy} npp={institution.npp} institutionName={institution.institutionName} />
      </section>
    </div>
  );
}
