import { StatDay } from "../api";

// 每日热量柱状图 + 目标虚线
export function BarChart({ days, target }: { days: StatDay[]; target?: number }) {
  const n = days.length;
  const step = 34, padB = 24, padT = 12;
  const W = Math.max(n * step, 240), H = 200;
  const innerH = H - padB - padT;
  const maxVal = Math.max(target || 0, ...days.map((d) => d.kcal), 1) * 1.15;
  const ty = H - padB - ((target || 0) / maxVal) * innerH;
  const labelEvery = Math.ceil(n / 7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {target ? <line x1="0" x2={W} y1={ty} y2={ty} className="chart-target" /> : null}
      {target ? <text x={W - 4} y={ty - 5} textAnchor="end" className="chart-target-label">目标 {target}</text> : null}
      {days.map((d, i) => {
        const h = (d.kcal / maxVal) * innerH;
        const over = target ? d.kcal > target * 1.1 : false;
        return (
          <g key={d.date}>
            <rect x={i * step + 7} y={H - padB - h} width={20} height={Math.max(h, d.kcal > 0 ? 2 : 0)} rx="4"
              className={over ? "bar-rect over" : "bar-rect"} />
            {d.kcal > 0 && n <= 10 && (
              <text x={i * step + 17} y={H - padB - h - 5} textAnchor="middle" className="chart-val">{d.kcal}</text>
            )}
            {i % labelEvery === 0 && (
              <text x={i * step + 17} y={H - 8} textAnchor="middle" className="chart-label">{d.date.slice(8)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// 体重折线图
export function LineChart({ points, unit = "kg" }: { points: { date: string; weight: number }[]; unit?: string }) {
  if (points.length === 0) return null;
  const W = 340, H = 170, pad = 30;
  const vals = points.map((p) => p.weight);
  const min = Math.min(...vals) - 0.8, max = Math.max(...vals) + 0.8;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - pad - ((v - min) / Math.max(max - min, 0.1)) * (H - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      <path d={path} className="line-path" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.weight)} r="3.5" className="line-dot" />
          {(i === 0 || i === points.length - 1) && (
            <text x={x(i)} y={y(p.weight) - 10} textAnchor="middle" className="chart-val">{p.weight}{unit}</text>
          )}
          {(i === 0 || i === points.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{p.date.slice(5)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
