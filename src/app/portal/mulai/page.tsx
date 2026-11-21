import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { getPasswordPolicy } from "@/lib/settings";
import { ChangePasswordForm } from "../akun/change-password-form";
import { InstitutionForm } from "@/app/admin/peserta/institution-form";
import { loadInstitutionFormOptions } from "@/app/admin/peserta/form-options";
import { completeProfileAction } from "./actions";

export default async function MulaiPage() {
  const user = await requireRole(["PARTICIPANT"], { allowSetup: true });
  if (!user.setup) redirect("/portal/beranda");
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: user.institutionId! }, include: { region: true } });

  const steps = (
    <ol className="flex gap-4 text-sm">
      <li className={user.setup === "password" ? "font-semibold" : "text-muted-foreground"}>1. Ganti password awal</li>
      <li className={user.setup === "profile" ? "font-semibold" : "text-muted-foreground"}>2. Lengkapi profil lembaga</li>
    </ol>
  );

  if (user.setup === "password") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Selamat datang, {institution.institutionName}</h1>
        {steps}
        <p className="text-sm text-muted-foreground">
          Akun Anda dibuat oleh admin. Demi keamanan, ganti password awal dari admin dengan password milik Anda sendiri.
          Isi &quot;Password lama&quot; dengan password yang diberikan admin.
        </p>
        <div className="box p-5">
          <ChangePasswordForm policy={await getPasswordPolicy()} institutionName={institution.institutionName} />
        </div>
      </div>
    );
  }

  const { types, districts } = await loadInstitutionFormOptions({ typeId: institution.typeId, regionId: institution.regionId ?? "" });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lengkapi profil lembaga</h1>
      {steps}
      <p className="text-sm text-muted-foreground">
        Lengkapi data lembaga Anda sesuai format IPLM. Setelah disimpan, menu Survei dan Rekap Kunjungan bisa dipakai.
        Jenis peserta dan email ditetapkan admin — hubungi admin jika keliru.
      </p>
      <InstitutionForm
        types={types}
        districts={districts}
        canEditNpp
        participant
        action={completeProfileAction}
        initial={{
          npp: institution.npp ?? "",
          npsn: institution.npsn ?? "",
          libraryName: institution.libraryName,
          institutionName: institution.institutionName,
          typeId: institution.typeId,
          districtId: institution.region?.parentId ?? "",
          villageId: institution.regionId ?? "",
          address: institution.address ?? "",
          headName: institution.headName ?? "",
          picName: institution.picName ?? "",
          officialEmail: institution.officialEmail,
          whatsapp: institution.whatsapp ?? "",
        }}
      />
    </div>
  );
}
