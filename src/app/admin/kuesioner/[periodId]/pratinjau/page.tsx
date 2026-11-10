import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { loadSurveyDefinition } from "@/lib/surveyDefinition";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Preview } from "./preview";

export default async function PratinjauPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ jenis?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ periodId }, { jenis }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(periodId).success) notFound();
  const questionnaire = await prisma.questionnaire.findFirst({ where: { periodId, deletedAt: null, period: { deletedAt: null } } });
  if (!questionnaire) notFound();

  const [definition, types] = await Promise.all([
    loadSurveyDefinition(questionnaire.id),
    prisma.institutionType.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const type = types.find((t) => t.id === jenis) ?? types[0] ?? null;

  return (
    <div className="space-y-6">
      <Link href={`/admin/kuesioner/${periodId}`} className="text-sm underline">
        ← Builder kuesioner
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Pratinjau: {definition.title}</h1>
        <p className="text-sm text-muted-foreground">Isian di halaman ini tidak disimpan.</p>
      </div>
      <form className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="jenis">Lihat sebagai jenis</Label>
          <select id="jenis" name="jenis" defaultValue={type?.id} className="h-9 rounded-md border px-2 text-sm">
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Tampilkan
        </Button>
      </form>
      {/* key: ganti jenis = mulai isian baru */}
      <Preview key={type?.id} definition={definition} institutionType={type ? { id: type.id, code: type.code } : null} />
    </div>
  );
}
