import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { formatWib } from "@/lib/date";
import { TEMPLATE_INFO } from "@/lib/email/templates";

/** FR-14.02: daftar template email. */
export default async function TemplateEmailListPage() {
  await requireRole(["SUPER_ADMIN"]);
  const templates = await prisma.emailTemplate.findMany({ where: { deletedAt: null }, orderBy: { key: "asc" } });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Template email</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1">Template</th>
            <th>Subjek</th>
            <th>Diubah</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="py-1">
                <Link href={`/admin/pengaturan/template-email/${t.key}`} className="underline">
                  {TEMPLATE_INFO[t.key].label}
                </Link>
              </td>
              <td>{t.subject}</td>
              <td>{formatWib(t.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
