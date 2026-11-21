import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireRole } from "@/lib/auth/guard";
import { htmlVariables } from "@/lib/email/send";
import { renderTemplate, SAMPLE_VARIABLES, TEMPLATE_INFO } from "@/lib/email/templates";
import { FlashMessage } from "@/components/flash-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmailTemplateKey } from "@prisma/client";
import { saveTemplateAction, sendTestAction } from "../actions";

/** FR-14.02: ubah template, pratinjau dengan contoh variabel, kirim uji. */
export default async function TemplateEmailPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  if (!(key in TEMPLATE_INFO)) notFound();
  const info = TEMPLATE_INFO[key as EmailTemplateKey];
  const template = await prisma.emailTemplate.findUnique({ where: { key: key as EmailTemplateKey } });
  if (!template) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/pengaturan/template-email" className="text-sm underline">
        ← Semua template
      </Link>
      <h1 className="text-xl font-semibold">{info.label}</h1>
      <FlashMessage ok={sp.ok} error={sp.error} />
      <p className="text-sm">
        Variabel tersedia: {info.variables.map((v) => <code key={v} className="mr-2 rounded bg-muted px-1">{`{${v}}`}</code>)}
      </p>

      <form action={saveTemplateAction} className="space-y-3">
        <input type="hidden" name="key" value={key} />
        <div className="space-y-1">
          <Label htmlFor="subject">Subjek</Label>
          <Input id="subject" name="subject" defaultValue={template.subject} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bodyHtml">Isi (HTML)</Label>
          <textarea id="bodyHtml" name="bodyHtml" defaultValue={template.bodyHtml} required rows={10} className="w-full rounded-md border p-2 font-mono text-xs" />
        </div>
        <Button type="submit">Simpan</Button>
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">Pratinjau (versi tersimpan, contoh data)</h2>
        <p className="text-sm" data-testid="preview-subject">
          Subjek: {renderTemplate(template.subject, SAMPLE_VARIABLES)}
        </p>
        {/* sandbox tanpa izin: HTML template tidak bisa menjalankan skrip di panel admin */}
        <iframe title="Pratinjau email" sandbox="" srcDoc={renderTemplate(template.bodyHtml, htmlVariables(SAMPLE_VARIABLES))} className="h-64 w-full rounded-md border bg-white" />
        <form action={sendTestAction}>
          <input type="hidden" name="key" value={key} />
          <Button type="submit" variant="outline" size="sm">
            Kirim uji ke email saya
          </Button>
        </form>
      </section>
    </div>
  );
}
