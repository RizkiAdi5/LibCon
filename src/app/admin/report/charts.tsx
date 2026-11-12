import { RadarChart } from "@/components/radar-chart";
import { groupMean, histogram, questionStats, type ReportRow } from "@/lib/report";

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const fmt3 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

function Bars({ title, items, max, format = fmt }: { title: string; items: { label: string; value: number; note?: string }[]; max: number; format?: Intl.NumberFormat }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada data.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((i) => (
            <li key={i.label} className="grid grid-cols-[8rem_1fr_4rem] items-center gap-2">
              <span className="truncate" title={i.label}>
                {i.label}
              </span>
              <span className="h-3 rounded-sm bg-muted">
                <span className="block h-3 rounded-sm bg-primary" style={{ width: `${max ? Math.min(100, (i.value / max) * 100) : 0}%` }} />
              </span>
              <span className="tabular-nums">
                {format.format(i.value)}
                {i.note}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** FR-11.03 grafik (histogram, subdimensi per jenis, kecamatan, tren, radar) + FR-11.04 analitik jawaban. */
export function ReportCharts({ rows, focusId, query }: { rows: ReportRow[]; focusId?: string; query: URLSearchParams }) {
  const scored = rows.filter((r): r is ReportRow & { score: NonNullable<ReportRow["score"]> } => !!r.score);
  const subCodes = [...new Map(scored.flatMap((r) => Object.entries(r.score.nodeInfo ?? {}).filter(([, i]) => i.level === "SUBDIMENSION"))).entries()].sort(([a], [b]) => a.localeCompare(b));
  const types = [...new Set(scored.map((r) => r.typeName))].sort();
  const numericCodes = [...new Set(rows.flatMap((r) => Object.entries(r.answers).filter(([, v]) => typeof v === "number").map(([k]) => k)))].sort();
  const focus = scored.find((r) => r.institutionId === focusId);
  const peers = focus ? scored.filter((r) => r.periodId === focus.periodId && r.typeId === focus.typeId) : [];
  const hidden = [...query.entries()].filter(([k]) => k !== "lembaga");

  return (
    <section className="space-y-6">
      <h2 className="font-semibold">Grafik & analitik</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <Bars title="Sebaran indeks (histogram)" items={histogram(scored.map((r) => r.score.indexScore)).map((b) => ({ label: `${b.from}–${b.to}`, value: b.count }))} max={Math.max(1, ...histogram(scored.map((r) => r.score.indexScore)).map((b) => b.count))} />
        <Bars title="Rata-rata indeks per kecamatan" items={groupMean(scored, (r) => r.districtName, (r) => r.score.indexScore).map((g) => ({ label: g.group, value: g.mean, note: ` (n=${g.n})` }))} max={100} />
        <Bars title="Tren rata-rata indeks antar periode" items={groupMean(scored, (r) => `${r.periodYear} ${r.periodName}`, (r) => r.score.indexScore).map((g) => ({ label: g.group, value: g.mean }))} max={100} />
        {types.map((t) => (
          <Bars
            key={t}
            title={`Rata-rata subdimensi — ${t}`}
            format={fmt3}
            max={1}
            items={subCodes.flatMap(([code, info]) => groupMean(scored.filter((r) => r.typeName === t), () => info.name, (r) => r.score.nodes[code]).map((g) => ({ label: g.group, value: g.mean })))}
          />
        ))}
      </div>

      <div className="space-y-2">
        <form className="flex items-end gap-2 text-sm">
          {hidden.map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <label className="space-y-1">
            <span className="block font-medium">Radar satu lembaga</span>
            <select name="lembaga" defaultValue={focusId ?? ""} className="h-9 rounded-md border px-2">
              <option value="">— pilih lembaga —</option>
              {[...new Map(scored.map((r) => [r.institutionId, r.libraryName])).entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md border px-3">
            Tampilkan
          </button>
        </form>
        {focus && (
          <RadarChart
            axes={subCodes.map(([, i]) => i.name)}
            series={[
              { label: focus.libraryName, values: subCodes.map(([c]) => focus.score.nodes[c] ?? 0), className: "fill-primary/30 stroke-primary" },
              { label: `Rata-rata ${focus.typeName}`, values: subCodes.map(([c]) => groupMean(peers, () => "x", (r) => r.score.nodes[c])[0]?.mean ?? 0), className: "fill-none stroke-muted-foreground" },
            ]}
          />
        )}
      </div>

      <div className="space-y-2 overflow-x-auto">
        <h3 className="text-sm font-medium">Analitik jawaban (soal angka)</h3>
        {numericCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada jawaban angka.</p>
        ) : (
          <table className="w-full text-xs" data-testid="answer-stats">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>Kode soal</th>
                <th>Terisi</th>
                <th>Kosong</th>
                <th>Rata-rata</th>
                <th>Median</th>
                <th>Min</th>
                <th>Maks</th>
              </tr>
            </thead>
            <tbody>
              {numericCodes.map((code) => {
                const s = questionStats(rows.filter((r) => r.submissionId).map((r) => r.answers[code]));
                const f = (v: number | null) => (v === null ? "–" : fmt.format(v));
                return (
                  <tr key={code} className="border-t">
                    <td className="font-mono">{code}</td>
                    <td>{s.count}</td>
                    <td>{s.empty}</td>
                    <td>{f(s.mean)}</td>
                    <td>{f(s.median)}</td>
                    <td>{f(s.min)}</td>
                    <td>{f(s.max)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
