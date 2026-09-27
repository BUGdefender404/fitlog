import { useCallback, useEffect, useRef, useState } from "react";
import {
  Food, LIGHT_LABEL, Meal, MEALS, RecogItem, Store, addDays, compressImage, mealLabel, trafficLight,
} from "../api";
import { CustomFoodSheet, FoodPortionSheet } from "../components/sheets";

export default function AddPage(props: {
  store: Store; date: string; meal: Meal; notify: (m: string) => void; onSaved: (msg: string) => void;
}) {
  const { store, date, meal: initMeal, notify, onSaved } = props;
  const [meal, setMeal] = useState<Meal>(initMeal);
  const [sub, setSub] = useState<"photo" | "search">("photo");
  // 拍照识别
  const [preview, setPreview] = useState("");
  const [thumb, setThumb] = useState<string | null>(null);
  const [items, setItems] = useState<RecogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  // 搜索
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Food[]>([]);
  const [cat, setCat] = useState("全部");
  const [portion, setPortion] = useState<Food | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number>(0);

  useEffect(() => { store.searchFoods("").then((all) => setFavorites(all.filter((f) => f.is_favorite))).catch(() => {}); }, [store]);

  const loadResults = useCallback(async (query: string) => {
    try { setResults(await store.searchFoods(query)); } catch {}
  }, [store]);
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => loadResults(q.trim()), q.trim() ? 300 : 0);
    return () => window.clearTimeout(searchTimer.current);
  }, [q, loadResults]);

  const onPick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setItems(null); setPreview("");
    try {
      const { main, thumb } = await compressImage(file);
      setPreview(main); setThumb(thumb);
      const res = await store.recognize(main);
      setItems(res);
      if (!res.length) notify("没识别到食物，换个角度再拍一张试试");
    } catch (e: any) { notify(e.message || "识别失败，请重试"); } finally { setBusy(false); }
  };
  const setItem = (i: number, patch: Partial<RecogItem>) =>
    setItems((arr) => {
      if (!arr) return arr;
      const next = [...arr];
      const it = { ...next[i], ...patch };
      it.kcal = Math.round((it.per100.kcal * it.grams) / 100);
      it.protein = Math.round((it.per100.protein * it.grams) / 10) / 10;
      it.carb = Math.round((it.per100.carb * it.grams) / 10) / 10;
      it.fat = Math.round((it.per100.fat * it.grams) / 10) / 10;
      next[i] = it;
      return next;
    });
  const saveAll = async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      const count = await store.addEntries(date, meal, items, thumb);
      // AI 估算项沉淀为自定义食物，下次识别直接命中库内标准值
      for (const it of items) {
        if (it.source === "ai" && !it.food_id) {
          try { await store.addCustomFood({ name: it.name, category: "自定义", per100: it.per100 }); } catch {}
        }
      }
      setItems(null); setPreview(""); setThumb(null);
      await onSaved(`已记录 ${count} 项到${mealLabel(meal)}`);
    } catch (e: any) { notify(e.message || "保存失败"); } finally { setBusy(false); }
  };
  const copyYesterday = async () => {
    try {
      const n = await store.copyMeal(addDays(date, -1), date, meal);
      notify(n ? `已复制昨天${mealLabel(meal)} ${n} 项` : "昨天这一餐没有记录");
      if (n) await onSaved(`已复制昨天${mealLabel(meal)}`);
    } catch (e: any) { notify(e.message || "复制失败"); }
  };
  const toggleFav = async (f: Food) => {
    await store.toggleFavorite(f.id);
    const all = await store.searchFoods(q.trim());
    setResults(all);
    setFavorites(all.filter((x) => x.is_favorite));
  };
  const starFav = async () => {
    const all = await store.searchFoods("");
    setFavorites(all.filter((x) => x.is_favorite));
  };

  const cats = ["全部", "收藏", "自定义", "主食", "蛋白", "蔬菜", "水果", "菜品", "饮品", "其他"];
  const shown = results
    .filter((f) => (cat === "全部" ? true
      : cat === "收藏" ? f.is_favorite === 1
      : cat === "自定义" ? f.source === "custom" || f.source === "ai"
      : cat === "其他" ? !["主食", "蛋白", "蔬菜", "水果", "菜品", "饮品", "坚果零食", "调味品"].includes(f.category)
      : f.category === cat || (cat === "蔬果" && ["蔬菜", "水果"].includes(f.category))))
    .slice(0, 40);

  return (
    <div className="page">
      <div className="chips">
        {MEALS.map((m) => (
          <button key={m.key} className={meal === m.key ? "on" : ""} onClick={() => setMeal(m.key)}>{m.label}</button>
        ))}
        <span className="chips-date">{date.slice(5).replace("-", "/")}</span>
      </div>

      <div className="subtabs">
        <button className={sub === "photo" ? "on" : ""} onClick={() => setSub("photo")}>拍照识别</button>
        <button className={sub === "search" ? "on" : ""} onClick={() => setSub("search")}>搜索与自定义</button>
      </div>

      {sub === "photo" && (
        <section className="card">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e.target.files?.[0])} />
          {!preview && !busy && (
            <button className="photo-btn" onClick={() => fileRef.current?.click()}>
              <b>📷 拍下你的食物</b>
              <span>或点击从相册选择 · 支持一餐多菜</span>
            </button>
          )}
          {busy && <div className="loading">AI 正在识别中…（约 3~8 秒）</div>}
          {preview && <img className="preview" src={preview} />}
          {items && items.length > 0 && (
            <>
              <p className="recog-hint">识别结果（可修改克数 / 名称，删除误识别项）：</p>
              {items.map((it, i) => (
                <div className="recog-item" key={i}>
                  <input className="ri-name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  <div className="ri-row">
                    <span className={`fdot ${trafficLight({ per100: it.per100.kcal, protein: it.per100.protein, fat: it.per100.fat }).level}`}
                      title={LIGHT_LABEL[trafficLight({ per100: it.per100.kcal, protein: it.per100.protein, fat: it.per100.fat }).level]} />
                    <span className={`badge ${it.source === "db" ? "badge-db" : "badge-ai"}`}>{it.source === "db" ? "标准值" : "AI估算"}</span>
                    <span className="ri-grams">
                      <input type="number" value={it.grams} onChange={(e) => setItem(i, { grams: Number(e.target.value) || 0 })} /> g
                    </span>
                    <b className="ri-kcal">{it.kcal} kcal</b>
                    <button className="del" onClick={() => setItems((arr) => (arr ? arr.filter((_, j) => j !== i) : arr))}>×</button>
                  </div>
                  <div className="ri-macro">蛋白 {it.protein}g · 碳水 {it.carb}g · 脂肪 {it.fat}g</div>
                </div>
              ))}
              <button className="primary" disabled={busy} onClick={saveAll}>全部记录到「{mealLabel(meal)}」</button>
            </>
          )}
          {preview && !busy && (!items || items.length === 0) && (
            <button className="photo-btn again" onClick={() => fileRef.current?.click()}>再拍一张</button>
          )}
        </section>
      )}

      {sub === "search" && (
        <section className="card">
          <div className="search-actions">
            <button onClick={copyYesterday}>📋 复制昨天{mealLabel(meal)}</button>
            <button onClick={() => setShowCustom(true)}>➕ 自定义食物</button>
          </div>
          {favorites.length > 0 && (
            <div className="fav-strip">
              {favorites.map((f) => (
                <button key={f.id} className="fav-chip" onClick={() => setPortion(f)}>⭐ {f.name}</button>
              ))}
            </div>
          )}
          <input className="search" placeholder="搜索食物，如：米饭 / 鸡胸肉 / 苹果" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="cat-strip">
            {cats.map((c) => (
              <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <ul className="food-list">
            {shown.map((f) => {
              const lt = trafficLight(f);
              return (
                <li key={f.id} onClick={() => setPortion(f)}>
                  <span className={`fdot ${lt.level}`} title={LIGHT_LABEL[lt.level] + " · " + lt.reason} />
                  <span className="fn">
                    {f.name}
                    <i>{f.category}</i>
                    {!!f.logged && <span className="logged-badge">记录过</span>}
                  </span>
                  <span className="fk">
                    <b className="fk-kcal">{f.per100}</b> 千卡/100克
                    <button className={`star ${f.is_favorite ? "on" : ""}`}
                      onClick={(ev) => { ev.stopPropagation(); toggleFav(f); }}>★</button>
                  </span>
                </li>
              );
            })}
            {shown.length === 0 && q && <li className="noresult">没找到？<b onClick={() => setShowCustom(true)}>去自定义食物</b>，把包装上的配料表录进去</li>}
            {shown.length === 0 && !q && <li className="noresult">输入名称搜索食物库，或点上方「自定义食物」</li>}
          </ul>
        </section>
      )}

      {portion && (
        <FoodPortionSheet store={store} mode="add" date={date} meal={meal} food={portion}
          onClose={() => setPortion(null)}
          onDone={async (msg) => { setPortion(null); await onSaved(msg); }} />
      )}
      {showCustom && (
        <CustomFoodSheet store={store} notify={notify} onClose={() => setShowCustom(false)}
          onSaved={async () => { setShowCustom(false); notify("自定义食物已保存"); await loadResults(q.trim()); await starFav(); }} />
      )}
    </div>
  );
}
