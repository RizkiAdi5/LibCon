import type { PasswordRuleId } from "@/lib/auth/passwordPolicy";

const RULE_LABELS: Record<PasswordRuleId, string> = {
  minLength: "Minimal 10 karakter",
  uppercase: "Mengandung huruf besar",
  lowercase: "Mengandung huruf kecil",
  number: "Mengandung angka",
  symbol: "Mengandung simbol",
  noNppOrInstitutionName: "Tidak memuat NPP/nama lembaga",
  notCommon: "Bukan password umum",
};

/** Daftar aturan yang tercentang saat terpenuhi (FR-03.05). */
export function PasswordRules({ failedRules }: { failedRules: PasswordRuleId[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {(Object.keys(RULE_LABELS) as PasswordRuleId[]).map((rule) => (
        <li key={rule} className={failedRules.includes(rule) ? "text-muted-foreground" : "text-green-600"}>
          {failedRules.includes(rule) ? "○" : "✓"} {RULE_LABELS[rule]}
        </li>
      ))}
    </ul>
  );
}
