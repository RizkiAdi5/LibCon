import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { loadInstitutionFormOptions } from "../form-options";
import { InstitutionForm } from "../institution-form";

export default async function TambahPesertaPage() {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const { types, districts } = await loadInstitutionFormOptions();

  return (
    <div className="space-y-4">
      <Link href="/admin/peserta" className="text-sm underline">
        ← Daftar peserta
      </Link>
      <h1 className="text-xl font-semibold">Tambah lembaga</h1>
      <p className="text-sm text-muted-foreground">
        Setelah disimpan, sistem membuat akun utama (username = NPP) dan mengirim link aktivasi ke email resmi.
      </p>
      <InstitutionForm types={types} districts={districts} canEditNpp />
    </div>
  );
}
