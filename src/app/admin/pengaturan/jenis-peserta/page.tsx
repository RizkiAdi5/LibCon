import { prisma } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { ConfirmAction } from "@/components/confirm-action";
import { RecordHistory } from "@/components/record-history";
import {
  createInstitutionTypeAction,
  deleteInstitutionTypeAction,
  toggleInstitutionTypeActiveAction,
  updateInstitutionTypeAction,
} from "./actions";

export default async function JenisPesertaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const types = await prisma.institutionType.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const allTypeIds = (await prisma.institutionType.findMany({ select: { id: true } })).map((t) => t.id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Jenis Peserta</h1>
      <FlashMessage ok={ok} error={error} />

      <form action={createInstitutionTypeAction} className="flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="space-y-1">
          <Label htmlFor="code">Kode</Label>
          <Input id="code" name="code" className="w-28" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="name">Nama</Label>
          <Input id="name" name="name" className="w-64" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sortOrder">Urutan</Label>
          <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={types.length + 1} className="w-20" />
        </div>
        <Button type="submit">Tambah jenis</Button>
      </form>

      <ul className="divide-y rounded-md border">
        {types.map((type) => (
          <li key={type.id} className="flex flex-wrap items-center gap-2 p-3">
            <form action={updateInstitutionTypeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={type.id} />
              <Input name="sortOrder" type="number" min={0} defaultValue={type.sortOrder} aria-label={`Urutan ${type.name}`} className="w-16" />
              <Input name="code" defaultValue={type.code} aria-label={`Kode ${type.name}`} className="w-24" required />
              <Input name="name" defaultValue={type.name} aria-label={`Nama ${type.name}`} className="w-64" required />
              <Button type="submit" variant="outline" size="sm">
                Simpan
              </Button>
            </form>
            <form action={toggleInstitutionTypeActiveAction}>
              <input type="hidden" name="id" value={type.id} />
              <Button type="submit" variant="ghost" size="sm">
                {type.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            </form>
            <ConfirmAction
              action={deleteInstitutionTypeAction}
              fields={{ id: type.id }}
              label="Hapus"
              confirmLabel={`Ya, hapus ${type.name}`}
              impact={`Jenis ${type.name} tidak bisa dipilih lagi. Jika sudah dipakai lembaga, penghapusan ditolak — gunakan Nonaktifkan.`}
            />
            <span className={type.isActive ? "text-xs text-green-700" : "text-xs text-destructive"}>
              {type.isActive ? "Aktif" : "Nonaktif"}
            </span>
          </li>
        ))}
      </ul>

      <RecordHistory targets={[{ table: "institution_types", ids: allTypeIds }]} labels={{ institution_types: "jenis peserta" }} returnTo="/admin/pengaturan/jenis-peserta" role="SUPER_ADMIN" />
    </div>
  );
}
