import type { SurveyQuestion } from "./surveyDefinition";
import { isEmpty } from "./validation/engine";

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

/** Teks tampilan satu jawaban (format angka Indonesia, label opsi). Kosong → "". */
export function formatAnswer(q: Pick<SurveyQuestion, "type" | "options" | "config">, value: unknown): string {
  if (isEmpty(value)) return "";
  const label = (v: unknown) => q.options.find((o) => o.value === v)?.label ?? String(v);
  switch (q.type) {
    case "INTEGER":
    case "DECIMAL":
    case "SCALE":
      return `${fmt.format(value as number)}${q.config.unit ? ` ${q.config.unit}` : ""}`;
    case "CURRENCY":
      return `Rp ${fmt.format(value as number)}`;
    case "PERCENT":
      return `${fmt.format(value as number)}%`;
    case "SINGLE_CHOICE":
    case "DROPDOWN":
    case "YES_NO":
      return label(value);
    case "MULTI_CHOICE":
      return (value as string[]).map(label).join(", ");
    case "TABLE":
      return `${(value as unknown[]).length} baris`;
    default:
      return String(value);
  }
}
