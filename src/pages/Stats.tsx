import { useEffect, useState } from "react";
import { Store, StatDay, Targets } from "../api";
import { BarChart, LineChart } from "../components/Charts";

export default function StatsPage(props: { store: Store; version: number }) {
  const { store, version } = props;
  const [range, setRange] = useState<7 | 30>(7);
  const [stats, setStats] = useState<{ days: StatDay[]; targets: Targets | null }>({ days: [], targets: null });

  useEffect(() => {
    store.getStats(range).then(setStats).catch(() => {});
  }, [store, range, version]);

  const logged = stats.days.filter((d) => d.kcal > 0);
  const avg = (f: (d: StatDay) => number) => (logged.length ? Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length) : 0);
  const weightPts = stats.days.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight as number }));
  const wDelta = weightPts.length >= 2 ? Math.round((weightPts[weightPts.length - 1].weight - weightPts[0].weight) * 10) / 10 : 0;
  const t = stats.targets;

  return (
    <div className="page">
      <div className="chips">
        <button className={range === 7 ? "on" : ""} onClick={() => setRange(7)}>近 7 天</button>
        <button className={range === 30 ? "on" : ""} onClick={() => setRange(30)}>近 30 天</button>
      </div>

      <section className="card">
        <h2>每日摄入 (千卡)</h2>
        {logged.length === 0 && <p className="muted-note">还没有记录，去「记一餐」拍下第一餐吧</p>}
        {logged.length > 0 && (
          <>
            <BarChart days={stats.days} target={t?.kcal} />
            <div className="stat-grid">
              <div><span>平均摄入</span><b>{avg((d) => d.kcal)}</b></div>
              <div><span>平均运动</span><b>{avg((d) => d.exercise_kcal)}</b></div>
              <div><span>记录天数</span><b>{logged.length}<i>/{stats.days.length}</i></b></div>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>平均营养素 (克/天)</h2>
        <div className="stat-grid">
          <div><span>蛋白质</span><b>{avg((d) => d.protein)}<i>/{t?.protein ?? "-"}</i></b></div>
          <div><span>碳水</span><b>{avg((d) => d.carb)}<i>/{t?.carb ?? "-"}</i></b></div>
          <div><span>脂肪</span><b>{avg((d) => d.fat)}<i>/{t?.fat ?? "-"}</i></b></div>
        </div>
      </section>

      <section className="card">
        <h2>体重趋势 {wDelta !== 0 && <em className={wDelta <= 0 ? "good" : "bad"}>{wDelta > 0 ? "+" : ""}{wDelta} kg</em>}</h2>
        {weightPts.length < 2 ? (
          <p className="muted-note">在「我的」页记录体重，这里会出现曲线</p>
        ) : (
          <LineChart points={weightPts} />
        )}
      </section>
    </div>
  );
}
