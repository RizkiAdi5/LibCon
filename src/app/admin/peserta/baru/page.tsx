import { requireRole } from "@/lib/auth/guard";
import { getPasswordPolicy } from "@/lib/settings";
import { loadInstitutionFormOptions } from "../form-options";
import { NewParticipantForm } from "./new-participant-form";

export default async function TambahPesertaPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ types }, policy] = await Promise.all([loadInstitutionFormOptions(), getPasswordPolicy()]);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">Buat akun peserta</h1>
        <p className="text-sm text-muted-foreground">
          Isi nama lembaga, email, dan password awal. Saat login pertama, peserta wajib mengganti password lalu
          melengkapi profil lembaga (NPP, wilayah, alamat, penanggung jawab) sebelum bisa memakai fitur lain.
        </p>
        <NewParticipantForm types={types} policy={policy} />
      </div>
    </div>
  );
}
