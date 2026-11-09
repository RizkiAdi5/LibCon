import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { FlashMessage } from "@/components/flash-message";
import { loadInstitutionFormOptions } from "../form-options";
import { InstitutionForm } from "../institution-form";
import { ACCOUNT_STATUS } from "../labels";

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

  const { types, districts } = await loadInstitutionFormOptions(institution);
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
            </tr>
          </thead>
          <tbody>
            {institution.users.map((account) => (
              <tr key={account.id} className="border-t">
                <td className="py-2">
                  {account.username} {account.isPrimary && <span className="text-xs text-muted-foreground">(utama)</span>}
                </td>
                <td>{account.email}</td>
                <td className={ACCOUNT_STATUS[account.status].className}>{ACCOUNT_STATUS[account.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
