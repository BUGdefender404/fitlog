import { useEffect, useRef, useState } from "react";
import { compressImage, computeItem, Entry, EX_PRESETS, Food, Meal, Per100, Store } from "../api";

// ---------------- 底部弹层 ----------------
export function BottomSheet({ children, onClose }: { children: any; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ---------------- 份量编辑（搜索添加 / 已有记录修改） ----------------
export function FoodPortionSheet(props: {
  store: Store; mode: "add" | "edit"; date: string; meal: Meal;
  food?: Food; entry?: Entry; onClose: () => void; onDone: (msg: string) => void;
}) {
  const { store, mode, date, meal, food, entry, onClose, onDone } = props;
  const [grams, setGrams] = useState(mode === "edit" ? entry!.grams : 100);
  const [busy, setBusy] = useState(false);
  const base: { name: string; per100: Per100 } =
    mode === "edit"
      ? { name: entry!.food_name, per100: { kcal: entry!.per100, protein: entry!.per100_protein, carb: entry!.per100_carb, fat: entry!.per100_fat } }
      : { name: food!.name, per100: { kcal: food!.per100, protein: food!.protein, carb: food!.carb, fat: food!.fat } };
  const cur = computeItem(base.name, grams || 0, base.per100, "db", null);
  const kJ = Math.round(cur.kcal * 4.184);
  const setG = (v: number) => setGrams(Math.max(0, Math.min(3000, Math.round(v))));
  const save = async () => {
    if (!(grams > 0)) return;
    setBusy(true);
    try {
      if (mode === "add") {
        await store.addEntries(date, meal, [{ name: base.name, grams, per100: base.per100, source: "db", food_id: food?.id ?? null }]);
        onDone(`已记录 ${base.name} ${grams}g`);
      } else {
        await store.patchEntry(date, entry!.id, grams);
        onDone("已修改");
      }
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true);
    try { await store.deleteEntry(date, entry!.id); onDone("已删除"); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <BottomSheet onClose={onClose}>
      <div className="ps-head">
        <b>{base.name}</b>
        {mode === "edit" && <span className={`badge ${entry!.source === "db" ? "badge-db" : "badge-ai"}`}>{entry!.source === "db" ? "标准值" : "AI估算"}</span>}
      </div>
      <div className="ps-kcal">
        <b>{cur.kcal}<i> / {kJ}</i></b>
        <span>热量(千卡/千焦)</span>
      </div>
      <div className="ps-macros">
        <div><i className="dot c" />碳水 <b>{cur.carb}g</b></div>
        <div><i className="dot p" />蛋白质 <b>{cur.protein}g</b></div>
        <div><i className="dot f" />脂肪 <b>{cur.fat}g</b></div>
      </div>
      <div className="ps-grams">
        <button onClick={() => setG(grams - 10)}>−</button>
        <input type="number" inputMode="decimal" value={grams} onChange={(e) => setGrams(Number(e.target.value) || 0)} />
        <span>克</span>
        <button onClick={() => setG(grams + 10)}>＋</button>
      </div>
      <div className="ps-presets">
        {[30, 50, 100, 150, 200, 300].map((g) => (
          <button key={g} className={grams === g ? "on" : ""} onClick={() => setG(g)}>{g}g</button>
        ))}
      </div>
      <div className="ps-btns">
        {mode === "edit" && <button className="danger" disabled={busy} onClick={del}>删除</button>}
        <button className="primary" disabled={busy || !(grams > 0)} onClick={save}>保存</button>
      </div>
    </BottomSheet>
  );
}

// ---------------- 自定义食物（含拍营养成分表识别） ----------------
const CATEGORIES = ["主食", "蛋白", "蔬菜", "水果", "菜品", "饮品", "坚果零食", "调味品", "自定义"];
export function CustomFoodSheet(props: { store: Store; notify: (m: string) => void; onClose: () => void; onSaved: () => void }) {
  const { store, notify, onClose, onSaved } = props;
  const [f, setF] = useState({ name: "", category: "自定义", basis: "100g" as "100g" | "serving", servingG: "", kj: "", protein: "", carb: "", fat: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((o) => ({ ...o, [k]: v }));
  const pickLabel = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const { main } = await compressImage(file, 1200);
      const r = await store.parseLabel(main);
      setF((o) => ({
        ...o,
        name: o.name || (r.name || ""),
        kj: String(r.per100.kcal ? Math.round(r.per100.kcal * 4.184) : ""),
        protein: String(r.per100.protein || ""),
        carb: String(r.per100.carb || ""),
        fat: String(r.per100.fat || ""),
        servingG: r.serving_g ? String(r.serving_g) : o.servingG,
        basis: r.serving_g ? "serving" : o.basis,
      }));
      notify("已识别营养成分表，请核对数值");
    } catch (e: any) { notify(e.message || "识别失败"); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!f.name.trim()) return notify("请填食物名称");
    const kj = Number(f.kj) || 0;
    const per: Per100 = {
      kcal: Math.round((kj / 4.184) * 10) / 10,
      protein: Number(f.protein) || 0,
      carb: Number(f.carb) || 0,
      fat: Number(f.fat) || 0,
    };
    if (!per.kcal && !per.protein && !per.carb && !per.fat) return notify("请填写营养数值");
    let per100 = per;
    if (f.basis === "serving") {
      const g = Number(f.servingG);
      if (!(g > 0)) return notify("请填写每份克数");
      per100 = {
        kcal: Math.round((per.kcal * 100) / g * 10) / 10,
        protein: Math.round((per.protein * 100) / g * 10) / 10,
        carb: Math.round((per.carb * 100) / g * 10) / 10,
        fat: Math.round((per.fat * 100) / g * 10) / 10,
      };
    }
    setBusy(true);
    try {
      await store.addCustomFood({ name: f.name, category: f.category, per100 });
      onSaved();
    } catch (e: any) { notify(e.message); } finally { setBusy(false); }
  };
  return (
    <BottomSheet onClose={onClose}>
      <div className="ps-head"><b>自定义食物</b><span className="muted">按包装营养成分表填写</span></div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickLabel(e.target.files?.[0])} />
      <button className="photo-btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "识别中…" : "📸 拍营养成分表，自动填写"}
      </button>
      <div className="cf-form">
        <div className="form-row"><label>名称</label><input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="如：某品牌全麦面包" /></div>
        <div className="form-row">
          <label>分类</label>
          <select value={f.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>数值基准</label>
          <div className="seg">
            <button className={f.basis === "100g" ? "on" : ""} onClick={() => set("basis", "100g")}>每100克</button>
            <button className={f.basis === "serving" ? "on" : ""} onClick={() => set("basis", "serving")}>每份</button>
          </div>
        </div>
        {f.basis === "serving" && <div className="form-row"><label>每份克数</label><input type="number" inputMode="decimal" value={f.servingG} onChange={(e) => set("servingG", e.target.value)} /></div>}
        <div className="form-row"><label>能量 (千焦 kJ)</label><input type="number" inputMode="decimal" value={f.kj} onChange={(e) => set("kj", e.target.value)} placeholder={f.kj === "" && Number(f.kj) === 0 ? "包装上写的 kJ 数" : ""} /></div>
        <div className="form-row"><label>蛋白质 (克)</label><input type="number" inputMode="decimal" value={f.protein} onChange={(e) => set("protein", e.target.value)} /></div>
        <div className="form-row"><label>碳水化合物 (克)</label><input type="number" inputMode="decimal" value={f.carb} onChange={(e) => set("carb", e.target.value)} /></div>
        <div className="form-row"><label>脂肪 (克)</label><input type="number" inputMode="decimal" value={f.fat} onChange={(e) => set("fat", e.target.value)} /></div>
      </div>
      <p className="cf-note">能量换算：包装上若是 1824 千焦 ≈ 436 千卡。填 kJ 即可，App 自动换算。</p>
      <button className="primary" disabled={busy} onClick={save}>保存到食物库</button>
    </BottomSheet>
  );
}

// ---------------- 运动记录 ----------------
export function ExerciseSheet(props: { store: Store; date: string; onClose: () => void; onDone: (msg: string) => void }) {
  const { store, date, onClose, onDone } = props;
  const [list, setList] = useState<{ id: number; name: string; minutes: number; kcal: number }[]>([]);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [kcal, setKcal] = useState("");
  const [weight, setWeight] = useState(60);
  const load = async () => {
    const b = await store.getDay(date);
    setList(b.exercise);
  };
  useEffect(() => {
    load().catch(() => {});
    store.getProfile().then((p) => p?.weight && setWeight(p.weight)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (n: string, met: number) => {
    setName(n);
    const m = Number(minutes) || 30;
    setKcal(String(Math.round((met * 3.5 * weight) / 200 * m)));
  };
  const add = async () => {
    if (!name) return;
    const k = Number(kcal) || Math.round((4.3 * 3.5 * weight) / 200 * (Number(minutes) || 30));
    await store.addExercise(date, { name, minutes: Number(minutes) || 0, kcal: k });
    setName(""); setKcal("");
    await load();
  };
  const del = async (id: number) => { await store.deleteExercise(id); await load(); };
  return (
    <BottomSheet onClose={onClose}>
      <div className="ps-head"><b>运动记录</b><span className="muted">{date.slice(5)}</span></div>
      {list.length > 0 && (
        <div className="ex-list">
          {list.map((e) => (
            <div className="ex-row" key={e.id}>
              <span className="fn">{e.name}<i>{e.minutes}分钟</i></span>
              <b>{e.kcal} kcal</b>
              <button className="del" onClick={() => del(e.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="ex-presets">
        {EX_PRESETS.map((p) => (
          <button key={p.name} className={name === p.name ? "on" : ""} onClick={() => pick(p.name, p.met)}>{p.name}</button>
        ))}
      </div>
      <div className="ex-form">
        <span>时长</span>
        <input type="number" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /> 分钟
        <span>消耗</span>
        <input type="number" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="自动估算" /> 千卡
      </div>
      <p className="cf-note">消耗按 MET 公式 × 你的体重({weight}kg)自动估算，可手动修改。</p>
      <button className="primary" disabled={!name} onClick={add}>添加</button>
    </BottomSheet>
  );
}
