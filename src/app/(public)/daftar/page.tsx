import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/db/client";
import { RegistrationForm } from "./registration-form";

// Tanpa params/cookies, Next akan nge-bake daftar jenis peserta jadi statis saat build — harus dipaksa dinamis.
export const dynamic = "force-dynamic";

export default async function DaftarPage() {
  const types = await prisma.institutionType.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Daftarkan lembaga</CardTitle>
          <CardDescription>
            Pengajuan ditinjau admin Perpustakaan Kota. Kamu akan menerima email aktivasi setelah disetujui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrationForm types={types} />
        </CardContent>
      </Card>
    </main>
  );
}
