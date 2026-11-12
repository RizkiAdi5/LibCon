/** Radar SVG sederhana (nilai 0–1). Seri pertama = lembaga, seri kedua (opsional) = pembanding. */
export function RadarChart({ axes, series, size = 260 }: { axes: string[]; series: { label: string; values: number[]; className: string }[]; size?: number }) {
  if (axes.length < 3) return <p className="text-sm text-muted-foreground">Radar butuh minimal 3 dimensi/subdimensi.</p>;
  const c = size / 2;
  const r = c - 50;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [c + Math.cos(a) * r * Math.max(0, Math.min(1, v)), c + Math.sin(a) * r * Math.max(0, Math.min(1, v))];
  };
  const poly = (values: number[]) => values.map((v, i) => point(i, v).join(",")).join(" ");
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Radar: ${series.map((s) => s.label).join(" vs ")}`}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <polygon key={g} points={poly(axes.map(() => g))} className="fill-none stroke-muted-foreground/30" />
        ))}
        {axes.map((label, i) => {
          const [x, y] = point(i, 1.18);
          return (
            <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[9px]">
              {label}
            </text>
          );
        })}
        {series.map((s) => (
          <polygon key={s.label} points={poly(s.values)} className={s.className} />
        ))}
      </svg>
      <figcaption className="flex gap-3 text-xs">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <svg width="10" height="10" aria-hidden>
              <rect width="10" height="10" className={s.className} />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
