import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { getLockoutPolicy } from "@/lib/settings";
import { isPermanentlyBlocked } from "@/lib/auth/loginThrottle";
import { accountAction, resendActivationAction, setInstitutionActiveAction } from "../actions";
import { loadInstitutionFormOptions } from "../form-options";
import { InstitutionForm } from "../institution-form";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";

export default async function DetailPesertaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);

  if (!z.uuid().safeParse(id).success) notFound();
  const institution = await prisma.institution.findUnique({
    where: { id },
    include: {
      region: true,
      users: { where: { deletedAt: null }, orderBy: { isPrimary: "desc" } },
    },
  });
  if (!institution) notFound();

  const [{ types, districts }, lockoutPolicy] = await Promise.all([
    loadInstitutionFormOptions(institution),
    getLockoutPolicy(),
  ]);
  const now = new Date();
  const isInactive = Boolean(institution.deletedAt);

  return (
    <div className="space-y-6">
      <Link href="/admin/peserta" className="text-sm underline">
        ← Daftar peserta
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{institution.libraryName}</h1>
        <p className={isInactive ? "text-sm text-destructive" : "text-sm text-green-700"}>
          {isInactive ? `Lembaga nonaktif sejak ${formatWib(institution.deletedAt!)}` : "Lembaga aktif"}
        </p>
      </div>
      <FlashMessage ok={ok} error={error} />

      <section className="space-y-3">
        <h2 className="font-semibold">Data lembaga</h2>
        <InstitutionForm
          types={types}
          districts={districts}
          canEditNpp={user.role === "SUPER_ADMIN"}
          initial={{
            id: institution.id,
            npp: institution.npp,
            npsn: institution.npsn ?? "",
            libraryName: institution.libraryName,
            institutionName: institution.institutionName,
            typeId: institution.typeId,
            districtId: institution.region.parentId ?? "",
            villageId: institution.regionId,
            address: institution.address,
            headName: institution.headName ?? "",
            picName: institution.picName,
            officialEmail: institution.officialEmail,
            whatsapp: institution.whatsapp ?? "",
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Akun</h2>
        <table className="w-full max-w-3xl text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Username</th>
              <th>Email</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {institution.users.map((account) => {
              const blocked = isPermanentlyBlocked(account.failedLoginCount, lockoutPolicy);
              const lockedUntil = account.lockedUntil && account.lockedUntil > now ? account.lockedUntil : null;
              const button = (action: string, label: string) => (
                <form action={accountAction}>
                  <input type="hidden" name="userId" value={account.id} />
                  <input type="hidden" name="action" value={action} />
                  <Button type="submit" variant="outline" size="sm">
                    {label}
                  </Button>
                </form>
              );
              return (
                <tr key={account.id} className="border-t align-top">
                  <td className="py-2">
                    {account.username}{" "}
                    {account.isPrimary && <span className="text-xs text-muted-foreground">(utama)</span>}
                  </td>
                  <td>{account.email}</td>
                  <td>
                    <span className={ACCOUNT_STATUS[account.status].className}>
                      {ACCOUNT_STATUS[account.status].label}
                    </span>
                    {blocked && <p className="text-destructive">Diblokir: terlalu banyak percobaan gagal</p>}
                    {!blocked && lockedUntil && (
                      <p className="text-amber-700">Terkunci sampai {formatWib(lockedUntil)}</p>
                    )}
                  </td>
                  <td className="flex flex-wrap gap-2 py-2">
                    {account.status === "ACTIVE" && button("reset-password", "Reset password")}
                    {(blocked || lockedUntil) && button("unblock", "Buka blokir")}
                    {account.status === "DISABLED" ? (
                      button("enable", "Aktifkan kembali")
                    ) : (
                      <ConfirmAction
                        action={accountAction}
                        fields={{ userId: account.id, action: "disable" }}
                        label="Nonaktifkan akun"
                        confirmLabel={`Ya, nonaktifkan ${account.username}`}
                        impact="Akun ini langsung keluar dan tidak bisa login sampai diaktifkan kembali."
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isInactive && institution.users.some((u) => u.isPrimary && u.status === "PENDING_ACTIVATION") && (
          <form action={resendActivationAction}>
            <input type="hidden" name="institutionId" value={institution.id} />
            <Button type="submit" variant="outline" size="sm">
              Kirim ulang aktivasi
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Status lembaga</h2>
        {isInactive ? (
          <form action={setInstitutionActiveAction}>
            <input type="hidden" name="id" value={institution.id} />
            <input type="hidden" name="active" value="true" />
            <Button type="submit" variant="outline">
              Pulihkan lembaga
            </Button>
          </form>
        ) : (
          <ConfirmAction
            action={setInstitutionActiveAction}
            fields={{ id: institution.id, active: "false" }}
            label="Nonaktifkan lembaga"
            confirmLabel={`Ya, nonaktifkan ${institution.libraryName}`}
            impact="Semua akun lembaga ini langsung keluar dan tidak bisa login, dan lembaga tidak masuk report default. Data tetap tersimpan dan bisa dipulihkan."
          />
        )}
      </section>
    </div>
  );
}
