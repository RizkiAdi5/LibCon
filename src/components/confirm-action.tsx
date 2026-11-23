import { Button, buttonVariants } from "@/components/ui/button";
import { ActionIcon } from "@/components/action-icon";

/**
 * Tindakan berbahaya dengan konfirmasi di halaman yang menyebut dampaknya
 * (Prinsip UX PRD §8) — tanpa JS: <details> membuka panel konfirmasi.
 */
export function ConfirmAction({
  action,
  fields,
  label,
  confirmLabel,
  impact,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirmLabel: string;
  impact: string;
}) {
  return (
    <details className="relative">
      <summary title={label} className={buttonVariants({ variant: "outline", className: "cursor-pointer list-none" })}>
        <ActionIcon label={label} />
        {label}
      </summary>
      <form action={action} className="mt-2 max-w-sm space-y-2 rounded-md border border-destructive/50 p-3">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="text-sm">{impact}</p>
        <Button type="submit" variant="destructive" size="sm">
          {confirmLabel}
        </Button>
      </form>
    </details>
  );
}
