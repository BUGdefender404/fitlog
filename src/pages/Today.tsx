import { useCallback, useEffect, useState } from "react";
import {
  DayBundle, Entry, Meal, MEALS, MEAL_RATIO, Store, Targets, WATER_GOAL,
  WEEKDAY_CHARS, addDays, fmtDate,
} from "../api";
import { ExerciseSheet, FoodPortionSheet } from "../components/sheets";

export default function TodayPage(props: {
  store: Store; date: string; setDate: (d: string) => void;
  targets: Targets | null; hasProfile: boolean; version: number;
  notify: (m: string) => void; openAdd: (date: string, meal: Meal) => void;
}) {
  const { store, date, setDate, targets, hasProfile, version, notify, openAdd } = props;
  const [data, setData] = useState<DayBundle>({ entries: [], totals: { kcal: 0, protein: 0, carb: 0, fat: 0 }, water_ml: 0, exercise: [], exercise_kcal: 0 });
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [showExercise, setShowExercise] = useState(false);

  const load = useCallback(async () => {
    try { setData(await store.getDay(date)); } catch {}
  }, [store, date]);
  useEffect(() => { load(); }, [load, version]);

  const t = targets;
  const eaten = data.totals.kcal;
  const burned = data.exercise_kcal;
  const remain = t ? t.kcal - eaten + burned : 0;
  const pct = t && t.kcal ? eaten / t.kcal : 0;
  const R = 52, C = 2 * Math.PI * R;

  // 周历（周日开头，薄荷风格）
  const base = new Date(date + "T12:00:00");
  const weekStart = addDays(date, -base.getDay());
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = fmtDate(new Date());

  const advice = (() => {
    const h = new Date().getHours();
    if (t && remain < 0) return `今日已超出 ${Math.round(-remain)} 千卡，散散步消化一下，明天更从容`;
    if (t && t.protein - data.totals.protein > 30 && h >= 15) return `蛋白质还差 ${Math.round(t.protein - data.totals.protein)}g，加个鸡蛋/鸡胸肉/一杯酸奶吧`;
    if (data.water_ml < 800 && h >= 14) return "今天喝水有点少，记得多喝一杯";
    if (eaten === 0) return "记录第一口，减脂就成功了一半";
    return "三大营养素均衡，继续保持 👏";
  })();

  const addWater = async (ml: number) => {
    await store.setWater(date, ml);
    notify(ml > 0 ? `已记录饮水 ${ml}ml` : "已减少");
    load();
  };

  return (
    <div className="page">
      {/* 周历 */}
      <header className="weekstrip">
        {week.map((d) => {
          const wd = new Date(d + "T12:00:00").getDay();
          const isSel = d === date;
          return (
            <button key={d} className={`ws-day ${isSel ? "on" : ""}`} onClick={() => setDate(d)}>
              <span>{WEEKDAY_CHARS[wd]}</span>
              <i>{d === todayStr ? "今天" : Number(d.slice(8))}</i>
            </button>
          );
        })}
      </header>

      {/* 总览 */}
      {hasProfile && t ? (
        <section className="card hero">
          <div className="hero-3col">
            <div className="hero-stat" onClick={() => openAdd(date, defaultMealOf())}>
              <span>饮食摄入</span>
              <b>{eaten}</b>
            </div>
            <div className="ring-wrap">
              <svg viewBox="0 0 120 120" className="ring">
                <circle cx="60" cy="60" r={R} className="ring-bg" />
                <circle cx="60" cy="60" r={R} className={pct > 1 ? "ring-fg over" : "ring-fg"}
                  strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(pct, 1))} />
              </svg>
              <div className="ring-center">
                {remain >= 0 ? (<><b>{Math.round(remain)}</b><span>还可以吃</span></>) : (<><b className="over-text">{Math.round(-remain)}</b><span>已超出</span></>)}
                <i>目标 {t.kcal} 千卡</i>
              </div>
            </div>
            <div className="hero-stat" onClick={() => setShowExercise(true)}>
              <span>运动消耗</span>
              <b>{burned}</b>
            </div>
          </div>
          <div className="macros3">
            {[
              { label: "碳水化合物", v: data.totals.carb, max: t.carb, cls: "c" },
              { label: "蛋白质", v: data.totals.protein, max: t.protein, cls: "p" },
              { label: "脂肪", v: data.totals.fat, max: t.fat, cls: "f" },
            ].map((m) => (
              <div key={m.cls} className="m3">
                <span className="m3-label">{m.label}</span>
                <div className="bar"><i className={m.cls} style={{ width: `${Math.min(100, m.max ? (m.v / m.max) * 100 : 0)}%` }} /></div>
                <span className="m3-val">{m.v} / {m.max}克</span>
              </div>
            ))}
          </div>
          <div className="advice">💡 {advice}</div>
        </section>
      ) : (
        <div className="card hint">先到「我的」页填写身体档案，自动算出每日减脂目标</div>
      )}

      {/* 饮水 */}
      <section className="card water-row">
        <span className="water-label">💧 饮水</span>
        <div className="water-bar"><i style={{ width: `${Math.min(100, (data.water_ml / WATER_GOAL) * 100)}%` }} /></div>
        <span className="water-val">{data.water_ml} / {WATER_GOAL}ml</span>
        <button onClick={() => addWater(250)}>+250</button>
        <button onClick={() => addWater(-250)}>−</button>
      </section>

      {/* 餐次卡片 */}
      {MEALS.map((m) => {
        const rows = data.entries.filter((e) => e.meal === m.key);
        const sum = rows.reduce((s, e) => s + e.kcal, 0);
        const ratio = MEAL_RATIO[m.key];
        const sug = t && ratio ? `${Math.round(t.kcal * ratio * 0.9)}-${Math.round(t.kcal * ratio * 1.1)}` : "";
        return (
          <section className="meal" key={m.key}>
            <h3>
              <span className="meal-name">
                {m.label}
                {sug && <em>建议{sug}千卡</em>}
              </span>
              <span className="meal-sum">
                {rows.length ? `${sum} 千卡` : ""}
                <button className="meal-add" onClick={() => openAdd(date, m.key)}>＋</button>
              </span>
            </h3>
            {rows.length === 0 && <div className="empty">未记录，点右上角 ＋</div>}
            {rows.map((e) => (
              <div className="entry" key={e.id} onClick={() => setEditEntry(e)}>
                {e.thumb ? <img src={e.thumb} className="thumb" /> : <div className="thumb ph">🍽</div>}
                <div className="entry-main">
                  <div className="entry-name">
                    {e.food_name}
                    <span className={`badge ${e.source === "db" ? "badge-db" : e.source === "ai" ? "badge-ai" : "badge-manual"}`}>
                      {e.source === "db" ? "标准值" : e.source === "ai" ? "AI估算" : "手动"}
                    </span>
                  </div>
                  <div className="entry-sub">{e.grams}g · 蛋白{e.protein} 碳水{e.carb} 脂肪{e.fat}</div>
                </div>
                <div className="entry-kcal">{e.kcal}<i>kcal</i></div>
              </div>
            ))}
          </section>
        );
      })}

      {editEntry && (
        <FoodPortionSheet store={store} mode="edit" date={date} meal={editEntry.meal} entry={editEntry}
          onClose={() => setEditEntry(null)}
          onDone={(msg) => { setEditEntry(null); notify(msg); load(); }} />
      )}
      {showExercise && (
        <ExerciseSheet store={store} date={date} onClose={() => setShowExercise(false)}
          onDone={(msg) => { setShowExercise(false); notify(msg); load(); }} />
      )}
    </div>
  );
}

function defaultMealOf(): Meal {
  const d = new Date(); const h = d.getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
