import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { QUESTION_TYPE_LABEL, type BuilderQuestionType } from "@/lib/questionnaire";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/flash-message";
import { saveSectionAction, updateQuestionnaireAction } from "../actions";
import { BuilderTree, SectionFields } from "./builder-tree";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const [{ periodId }, { ok, error }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(periodId).success) notFound();

  const questionnaire = await prisma.questionnaire.findFirst({
    where: { periodId, deletedAt: null, period: { deletedAt: null } },
    include: {
      period: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: { institutionTypes: { include: { institutionType: true } } },
          },
        },
      },
    },
  });
  if (!questionnaire) notFound();

  const published = questionnaire.status === "PUBLISHED";
  const archived = questionnaire.period.status === "ARCHIVED";
  const sections = questionnaire.sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? "",
    evidenceLabel: s.evidenceLabel ?? "",
    evidenceRequired: s.evidenceRequired,
    questions: s.questions.map((q) => ({
      id: q.id,
      code: q.code,
      label: q.label,
      typeLabel: QUESTION_TYPE_LABEL[q.type as BuilderQuestionType] ?? q.type,
      isRequired: q.isRequired,
      // FR-06.04: tanpa baris = semua jenis
      appliesTo: q.institutionTypes.map((t) => t.institutionType.code).join(", ") || "semua jenis",
    })),
  }));

  return (
    <div className="space-y-6">
      <Link href="/admin/kuesioner" className="text-sm underline">
        ← Daftar kuesioner
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{questionnaire.title}</h1>
        <p className="text-sm">
          Periode {questionnaire.period.name} · Status:{" "}
          <span className={published ? "text-green-700" : "text-muted-foreground"}>{published ? "Terbit (struktur terkunci)" : "Draf"}</span>
        </p>
      </div>
      <FlashMessage ok={ok} error={error} />
      {archived && <p className="text-sm text-amber-700">Periode sudah diarsipkan — kuesioner hanya bisa dilihat.</p>}

      {!archived && (
        <details>
          <summary className="cursor-pointer text-sm underline">Ubah judul & petunjuk kuesioner</summary>
          <form action={updateQuestionnaireAction} className="mt-2 max-w-xl space-y-2 rounded-md border p-3">
            <input type="hidden" name="periodId" value={periodId} />
            <div className="space-y-1">
              <Label htmlFor="qtitle">Judul kuesioner</Label>
              <Input id="qtitle" name="title" defaultValue={questionnaire.title} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="instructions">Petunjuk pengisian</Label>
              <textarea id="instructions" name="instructions" defaultValue={questionnaire.instructions ?? ""} className="min-h-16 w-full rounded-md border p-2 text-sm" />
            </div>
            <Button type="submit" size="sm">
              Simpan
            </Button>
          </form>
        </details>
      )}

      {sections.length === 0 && <p className="text-sm text-muted-foreground">Belum ada bagian. Mulai dengan menambah bagian, mis. Koleksi, SDM, Pelayanan.</p>}
      {archived ? (
        <ul className="space-y-2 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <b>{s.title}</b> — {s.questions.map((q) => q.code).join(", ") || "tanpa soal"}
            </li>
          ))}
        </ul>
      ) : (
        <BuilderTree periodId={periodId} sections={sections} published={published} />
      )}

      {!archived && !published && (
        <section className="max-w-xl space-y-2 rounded-md border p-4">
          <h2 className="font-semibold">Tambah bagian</h2>
          <form action={saveSectionAction} className="space-y-2">
            <input type="hidden" name="periodId" value={periodId} />
            <SectionFields published={false} />
            <Button type="submit">Tambah bagian</Button>
          </form>
        </section>
      )}
    </div>
  );
}
