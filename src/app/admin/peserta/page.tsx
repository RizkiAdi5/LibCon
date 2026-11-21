import Link from "next/link";
import type { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { getLockoutPolicy } from "@/lib/settings";
import { groupInstitutions } from "@/lib/institutionGroups";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconOnly } from "@/components/action-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { bulkResendActivationAction } from "./actions";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";

type SearchParams = { q?: string; status?: string; arsip?: string; ok?: string; error?: string };

export default async function PesertaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { q = "", status = "", arsip, ok, error } = await searchParams;
  const query = q.trim();
  const accountStatus = status in ACCOUNT_STATUS ? (status as UserStatus) : undefined;
  const showBlocked = status === "BLOCKED";
  const showInactive = arsip === "1";
  const { permanentBlockAfter } = await getLockoutPolicy();

  // FR-03.08: pencarian NPP/nama + filter status akun utama; lembaga nonaktif dipisah (FR-03.10)
  const where: Prisma.InstitutionWhereInput = {
    deletedAt: showInactive ? { not: null } : null,
    ...(query && {
      OR: [
        { npp: { contains: query } },
        { libraryName: { contains: query, mode: "insensitive" } },
        { institutionName: { contains: query, mode: "insensitive" } },
      ],
    }),
    ...(accountStatus && { users: { some: { isPrimary: true, deletedAt: null, status: accountStatus } } }),
    // FR-04.09: akun (utama atau kedua) yang diblokir karena terlalu banyak salah password
    ...(showBlocked && { users: { some: { deletedAt: null, failedLoginCount: { gte: permanentBlockAfter } } } }),
  };

  const institutions = await prisma.institution.findMany({
    where,
    orderBy: { libraryName: "asc" },
    include: {
      region: { include: { parent: true } },
      type: true,
      users: { where: { isPrimary: true, deletedAt: null } },
    },
  });

  const groups = groupInstitutions(
    institutions.map((i) => ({
      ...i,
      districtName: i.region?.parent?.name ?? "(tanpa kecamatan)",
      typeName: i.type.name,
      typeSortOrder: i.type.sortOrder,
      primary: i.users[0],
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Peserta</h1>
        <Link href="/admin/peserta/baru" className={buttonVariants()}>
          <IconOnly label="Buat akun peserta" text="Buat akun peserta" />
        </Link>
      </div>
      <FlashMessage ok={ok} error={error} />

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="q">Cari NPP / nama</Label>
          <Input id="q" name="q" defaultValue={query} className="w-64" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status akun</Label>
          <select id="status" name="status" defaultValue={accountStatus ?? (showBlocked ? "BLOCKED" : "")} className="h-9 rounded-md border px-2 text-sm">
            <option value="">Semua</option>
            {Object.entries(ACCOUNT_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="BLOCKED">Diblokir (terlalu banyak percobaan gagal)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="arsip" value="1" defaultChecked={showInactive} />
          Tampilkan lembaga nonaktif
        </label>
        <Button type="submit" variant="outline">
          Terapkan
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">{institutions.length} lembaga</p>

      <form action={bulkResendActivationAction} className="space-y-4">
        {!showInactive && (
          <Button type="submit" variant="outline" size="sm">
            Kirim ulang aktivasi ke yang dipilih
          </Button>
        )}
        {groups.map((district) => (
          <section key={district.districtName} className="rounded-md border p-4">
            <h2 className="font-semibold">
              Kec. {district.districtName} <span className="text-muted-foreground">({district.count})</span>
            </h2>
            {district.types.map((type) => (
              <div key={type.typeName} className="mt-3">
                <h3 className="text-sm font-medium">
                  {type.typeName} <span className="text-muted-foreground">({type.count})</span>
                </h3>
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {type.items.map((i) => {
                      const status = i.primary ? ACCOUNT_STATUS[i.primary.status] : null;
                      const canResend = !showInactive && i.primary?.status === "PENDING_ACTIVATION";
                      return (
                        <tr key={i.id} className="border-t">
                          <td className="w-8 py-2">
                            {canResend && (
                              <input type="checkbox" name="institutionId" value={i.id} aria-label={`Pilih ${i.libraryName}`} />
                            )}
                          </td>
                          <td className="w-32">{i.npp}</td>
                          <td>
                            <Link href={`/admin/peserta/${i.id}`} className="underline">
                              {i.libraryName}
                            </Link>
                          </td>
                          <td className="text-muted-foreground">{i.region?.name ?? (i.profileCompletedAt ? "–" : "Profil belum dilengkapi")}</td>
                          <td className={status?.className}>{status?.label ?? "Tanpa akun"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))}
      </form>
    </div>
  );
}
