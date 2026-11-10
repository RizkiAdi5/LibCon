import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";

/** Data bersama halaman tambah/ubah soal. 404 jika kuesioner tidak ada atau periode diarsipkan. */
export async function loadQuestionEditor(periodId: string) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  if (!z.uuid().safeParse(periodId).success) notFound();
  const questionnaire = await prisma.questionnaire.findFirst({
    where: { periodId, deletedAt: null, period: { deletedAt: null, status: { not: "ARCHIVED" } } },
    include: {
      sections: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } },
      questions: { where: { deletedAt: null }, select: { id: true, code: true } },
    },
  });
  if (!questionnaire) notFound();
  const institutionTypes = await prisma.institutionType.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return { questionnaire, institutionTypes, published: questionnaire.status === "PUBLISHED" };
}
