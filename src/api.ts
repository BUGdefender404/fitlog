// 轻食记 数据层：类型定义 + 双模式存储（服务器 / 手机本地 IndexedDB）+ 智谱直连 + 工具函数
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type Per100 = { kcal: number; protein: number; carb: number; fat: number };
export type Food = {
  id: number; name: string; category: string; aliases: string;
  per100: number; protein: number; carb: number; fat: number;
  fiber?: number | null; sugar?: number | null;
  off_grade?: string | null;
  source: string; is_favorite: number; logged?: number;
};
export type RecogItem = {
  food_id: number | null; name: string; grams: number; per100: Per100;
  confidence: number; kind: "basic" | "dish"; source: "db" | "ai";
  kcal: number; protein: number; carb: number; fat: number;
};
export type Entry = {
  id: number; date: string; meal: Meal; food_id: number | null; food_name: string;
  grams: number; per100: number; per100_protein: number; per100_carb: number; per100_fat: number;
  kcal: number; protein: number; carb: number; fat: number; source: string; thumb: string | null;
};
export type Totals = { kcal: number; protein: number; carb: number; fat: number };
export type Exercise = { id: number; date: string; name: string; minutes: number; kcal: number };
export type DayBundle = { entries: Entry[]; totals: Totals; water_ml: number; exercise: Exercise[]; exercise_kcal: number };
export type Profile = {
  sex: string | null; age: number | null; height: number | null; weight: number | null;
  activity: string; deficit: number; auto: number;
  target_kcal: number | null; target_protein: number | null; target_carb: number | null; target_fat: number | null;
} | null;
export type Targets = { kcal: number; protein: number; fat: number; carb: number; bmr: number; tdee: number };
export type StatDay = { date: string; kcal: number; protein: number; carb: number; fat: number; exercise_kcal: number; water_ml: number; weight: number | null };

export const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" },
  { key: "snack", label: "加餐" },
];
export const mealLabel = (k: string) => MEALS.find((m) => m.key === k)?.label || k;
export const WEEKDAY_CHARS = ["日", "一", "二", "三", "四", "五", "六"];
export function defaultMeal(): Meal {
  const d = new Date(); const h = d.getHours();
  if (h < 10 || (h === 10 && d.getMinutes() < 30)) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
export const MEAL_RATIO: Record<string, number> = { breakfast: 0.3, lunch: 0.4, dinner: 0.3, snack: 0 };
export const EX_PRESETS = [
  { name: "散步", met: 2.8 }, { name: "快走", met: 4.3 }, { name: "慢跑", met: 7.0 },
  { name: "骑行", met: 5.8 }, { name: "游泳", met: 7.0 }, { name: "力量训练", met: 5.0 },
  { name: "瑜伽", met: 3.0 }, { name: "跳绳", met: 11.0 },
];
export const WATER_GOAL = 1500;

// ---------- 红黄绿减脂分级 ----------
export type LightLevel = "green" | "yellow" | "red";
export const LIGHT_LABEL: Record<LightLevel, string> = {
  green: "绿灯 · 放心吃",
  yellow: "黄灯 · 适量吃",
  red: "红灯 · 少吃",
};
// Nutri-Score(a~e，Open Food Facts 官方分级) → 红黄绿
const NS_LABEL: Record<string, string> = { a: "营养分级 A（最优）", b: "营养分级 B", c: "营养分级 C", d: "营养分级 D", e: "营养分级 E（最差）" };
export function nutriLight(grade: string | null | undefined): LightLevel | null {
  if (grade === "a" || grade === "b") return "green";
  if (grade === "c") return "yellow";
  if (grade === "d" || grade === "e") return "red";
  return null;
}
export function trafficLight(f: { category?: string; per100: number; protein: number; fat: number; fiber?: number | null; sugar?: number | null; off_grade?: string | null }): { level: LightLevel; reason: string } {
  const ns = nutriLight(f.off_grade);
  if (ns) return { level: ns, reason: NS_LABEL[f.off_grade!] + " · Open Food Facts" };
  const isDrink = f.category === "饮品";
  const kcal = Number(f.per100) || 0;
  let lvl = isDrink
    ? (kcal <= 20 ? 0 : kcal <= 50 ? 1 : 2)
    : (kcal <= 100 ? 0 : kcal <= 250 ? 1 : 2);
  const plus: string[] = [], minus: string[] = [];
  if ((f.protein || 0) >= 15) { if (lvl > 0) lvl--; plus.push("高蛋白"); }
  if ((f.fiber ?? 0) >= 3) { if (lvl > 0) lvl--; plus.push("膳食纤维丰富"); }
  if ((f.fat || 0) >= 20 && f.category !== "坚果零食") { if (lvl < 2) lvl++; minus.push("脂肪较高"); }
  if (isDrink && (f.sugar ?? 0) >= 8) { if (lvl < 2) lvl++; minus.push("含糖高"); }
  const energy = isDrink ? "液体热量" : kcal <= 100 ? "能量密度低" : kcal <= 250 ? "能量中等" : "能量密度高";
  const detail = [...plus, ...minus].join("、");
  return { level: (["green", "yellow", "red"] as LightLevel[])[lvl], reason: detail ? `${energy} · ${detail}` : energy };
}

// ---------- 运行环境 ----------
export function envInfo() {
  const ua = navigator.userAgent;
  return {
    wechat: /MicroMessenger/i.test(ua),
    ios: /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document),
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true,
    android: /Android/i.test(ua),
    // 国内第三方浏览器（iPhone 上均无「添加到主屏幕」能力；安卓的快捷方式入口和权限也各不相同）
    quark: /Quark/i.test(ua),
    qqbrowser: /MQQBrowser/i.test(ua),
    safari:
      /Safari/i.test(ua) &&
      !/CriOS|FxiOS|EdgiOS|MQQBrowser|Quark|MicroMessenger|Baidu|UCBrowser|HeyTapBrowser|HuaweiBrowser|MiuiBrowser|OppoBrowser|VivoBrowser|Mercury/i.test(ua),
  };
}

export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return fmtDate(new Date(y, m - 1, d + delta));
}
export const r1 = (x: number) => Math.round(Number(x || 0) * 10) / 10;

export function calcTargets(p: { sex?: string | null; age?: number | null; height?: number | null; weight?: number | null; activity?: string; deficit?: number; auto?: boolean | number; target_kcal?: number | null }): Targets {
  const w = Number(p.weight) || 60;
  const bmr = 10 * w + 6.25 * Number(p.height) - 5 * Number(p.age) + (p.sex === "male" ? 5 : -161);
  const factor = { low: 1.2, mid: 1.375, high: 1.55, very: 1.725 }[p.activity || "mid"] || 1.375;
  const tdee = bmr * factor;
  const floor = p.sex === "female" ? 1200 : 1500;
  let kcal: number;
  if (p.auto) kcal = Math.max(tdee - (Number(p.deficit) || 300), floor);
  else kcal = Math.max(Number(p.target_kcal) || 1600, floor);
  const protein = Math.round(1.6 * w);
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(Math.round((kcal - protein * 4 - fat * 9) / 4), 0);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein, fat, carb };
}

// 名称归一化与模糊匹配（本地模式使用；服务器有同款实现）
export function normalizeName(s: string): string {
  return String(s || "").toLowerCase().replace(/[\s,，。、·（）()\[\]【】_'"“”?!！？:：\-—]/g, "");
}
export function scoreFood(f: Food, q: string): number {
  const n = normalizeName(f.name), query = normalizeName(q);
  let s = 0;
  if (n === query) s = 100;
  else if (query.length >= 2 && n.includes(query)) s = 80 + Math.min(query.length, 6);
  else if (n.length >= 2 && query.includes(n)) s = 70 + Math.min(n.length, 6);
  else for (const a of String(f.aliases || "").split(",")) {
    const an = normalizeName(a);
    if (!an) continue;
    if (an === query) { s = Math.max(s, 60); break; }
    if (query.length >= 2 && an.includes(query)) s = Math.max(s, 50);
    else if (an.length >= 2 && query.includes(an)) s = Math.max(s, 45);
  }
  return s;
}

export function computeItem(name: string, grams: number, per100: Per100, source: "db" | "ai", food_id: number | null, confidence = 0, kind: "basic" | "dish" = "basic"): RecogItem {
  return {
    food_id, name, grams, per100, source, confidence, kind,
    kcal: Math.round((per100.kcal * grams) / 100),
    protein: r1((per100.protein * grams) / 100),
    carb: r1((per100.carb * grams) / 100),
    fat: r1((per100.fat * grams) / 100),
  };
}

export function compressImage(file: File, mainMax = 1024, thumbMax = 240): Promise<{ main: string; thumb: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const draw = (max: number, q: number) => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
          return cv.toDataURL("image/jpeg", q);
        };
        resolve({ main: draw(mainMax, 0.85), thumb: draw(thumbMax, 0.7) });
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- 智谱直连（本地模式使用；服务器模式走服务端） ----------
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
export const FOOD_PROMPT = `你是食物营养分析助手。识别图片中的所有食物和饮品（忽略餐具、人、桌面）。
对每种食物估计份量与营养成分。只输出一个 JSON 数组，不要输出任何其他文字、注释或代码块标记。
格式：[{"name":"中文食物名(简短,如:米饭/鸡胸肉/宫保鸡丁)","grams":估计克数,"per100":{"kcal":每100克千卡,"protein":每100克蛋白质克,"carb":每100克碳水克,"fat":每100克脂肪克},"confidence":0到1,"kind":"basic或dish"}]
kind: basic=基础食材(蛋/肉/蔬菜/水果/主食/奶等), dish=混合烹饪的菜。若图片中没有食物，输出 []`;
export const LABEL_PROMPT = `你是食品营养成分表识别助手。识别图片中包装上的"营养成分表"表格。只输出一个 JSON 对象，不要输出任何其他文字：
{"name":"产品名(包装上可见则填,否则null)","per100":{"kj":每100克或每100毫升的能量(千焦,数字),"protein":蛋白质(克),"fat":脂肪(克),"carb":碳水化合物(克)},"serving_g":每份规格克数(表格无"每份"列则为null)}
注意：若表格只有"每份"一列没有"每100g"列，则将数值填入per100，并把每份克数填入serving_g。钠含量忽略。`;
export function getApiKey(): string { return localStorage.getItem("zhipu_key") || ""; }
export function setApiKey(k: string) { localStorage.setItem("zhipu_key", k.trim()); }
async function glmVision(imageDataUrl: string, prompt: string, maxTokens = 1024): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error("请先到「我的」页填写智谱 API Key");
  const res = await fetch(GLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "glm-4v-flash", temperature: 0.2, max_tokens: maxTokens,
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }, { type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `智谱接口错误 ${res.status}`);
  return String(j.choices?.[0]?.message?.content ?? "");
}
function extractJson(text: string): any {
  text = text.replace(/```json|```/g, "").trim();
  const s1 = text.indexOf("["), e1 = text.lastIndexOf("]");
  if (s1 >= 0 && e1 > s1) { try { return JSON.parse(text.slice(s1, e1 + 1)); } catch {} }
  const s2 = text.indexOf("{"), e2 = text.lastIndexOf("}");
  if (s2 >= 0 && e2 > s2) { try { return JSON.parse(text.slice(s2, e2 + 1)); } catch {} }
  return null;
}

// ---------- 存储接口 ----------
export interface Store {
  readonly kind: "server" | "local";
  getDay(date: string): Promise<DayBundle>;
  addEntries(date: string, meal: Meal, items: { name: string; grams: number; per100: Per100; source: "db" | "ai" | "manual"; food_id?: number | null }[], thumb?: string | null): Promise<number>;
  deleteEntry(date: string, id: number): Promise<void>;
  patchEntry(date: string, id: number, grams: number): Promise<void>;
  copyMeal(from: string, to: string, meal: Meal): Promise<number>;
  searchFoods(q: string): Promise<Food[]>;
  addCustomFood(f: { name: string; category: string; per100: Per100; aliases?: string; fiber?: number | null; sugar?: number | null; off_grade?: string | null }): Promise<Food>;
  toggleFavorite(id: number): Promise<void>;
  getProfile(): Promise<Profile>;
  saveProfile(p: { sex?: string; age?: number; height?: number; weight?: number; activity?: string; deficit?: number; auto?: boolean; target_kcal?: number; date?: string }): Promise<Targets>;
  setWater(date: string, deltaMl: number): Promise<void>;
  addExercise(date: string, e: { name: string; minutes: number; kcal: number }): Promise<void>;
  deleteExercise(id: number): Promise<void>;
  getWeights(days: number): Promise<{ date: string; weight: number }[]>;
  addWeight(date: string, weight: number): Promise<Targets | null>;
  getStats(days: number): Promise<{ days: StatDay[]; targets: Targets | null }>;
  recognize(imageDataUrl: string): Promise<RecogItem[]>;
  parseLabel(imageDataUrl: string): Promise<{ name: string | null; serving_g: number | null; per100: Per100 }>;
}

const errAuth = (e: unknown): boolean => e instanceof Error && e.name === "AuthError";

// ---------- 服务器模式 ----------
export class ServerStore implements Store {
  readonly kind = "server" as const;
  private async http<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json", "x-pin": localStorage.getItem("fitlog_pin") || "" }, ...init });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { const e = new Error("需要访问口令"); e.name = "AuthError"; throw e; }
      throw new Error((j as any).error || `请求失败 ${res.status}`);
    }
    return j as T;
  }
  getDay(date: string) { return this.http<DayBundle>(`/api/entries?date=${date}`); }
  async addEntries(date: string, meal: Meal, items: { name: string; grams: number; per100: Per100; source: "db" | "ai" | "manual"; food_id?: number | null }[], thumb?: string | null) {
    const r = await this.http<{ count: number }>("/api/entries/batch", { method: "POST", body: JSON.stringify({ date, meal, items, thumb }) });
    return r.count;
  }
  async deleteEntry(date: string, id: number) { await this.http(`/api/entries/${id}`, { method: "DELETE" }); }
  async patchEntry(date: string, id: number, grams: number) { await this.http(`/api/entries/${id}`, { method: "PATCH", body: JSON.stringify({ grams }) }); }
  async copyMeal(from: string, to: string, meal: Meal) {
    const r = await this.http<{ count: number }>("/api/entries/copy", { method: "POST", body: JSON.stringify({ from, to, meal }) });
    return r.count;
  }
  async searchFoods(q: string) { return this.http<Food[]>(`/api/foods?q=${encodeURIComponent(q)}`); }
  async addCustomFood(f: { name: string; category: string; per100: Per100; aliases?: string; fiber?: number | null; sugar?: number | null; off_grade?: string | null }) {
    const r = await this.http<{ food: Food }>("/api/foods", { method: "POST", body: JSON.stringify(f) });
    return r.food;
  }
  async toggleFavorite(id: number) { await this.http(`/api/foods/${id}/favorite`, { method: "POST" }); }
  getProfile() { return this.http<{ profile: Profile }>("/api/profile").then((r) => r.profile); }
  async saveProfile(p: Parameters<Store["saveProfile"]>[0]) { const r = await this.http<{ targets: Targets }>("/api/profile", { method: "POST", body: JSON.stringify(p) }); return r.targets; }
  async setWater(date: string, deltaMl: number) { await this.http("/api/water", { method: "POST", body: JSON.stringify({ date, ml: deltaMl }) }); }
  async addExercise(date: string, e: { name: string; minutes: number; kcal: number }) { await this.http("/api/exercise", { method: "POST", body: JSON.stringify({ date, ...e }) }); }
  async deleteExercise(id: number) { await this.http(`/api/exercise/${id}`, { method: "DELETE" }); }
  getWeights(days: number) { return this.http<{ date: string; weight: number }[]>(`/api/weights?days=${days}`); }
  async addWeight(date: string, weight: number) { const r = await this.http<{ targets: Targets | null }>("/api/weights", { method: "POST", body: JSON.stringify({ date, weight }) }); return r.targets; }
  getStats(days: number) { return this.http<{ days: StatDay[]; targets: Targets | null }>(`/api/stats?days=${days}`); }
  async recognize(imageDataUrl: string) {
    const r = await this.http<{ items: RecogItem[] }>("/api/recognize", { method: "POST", body: JSON.stringify({ image: imageDataUrl }) });
    return r.items;
  }
  parseLabel(imageDataUrl: string) { return this.http<{ name: string | null; serving_g: number | null; per100: Per100 }>("/api/parse-label", { method: "POST", body: JSON.stringify({ image: imageDataUrl }) }); }
}

// ---------- 本地模式（IndexedDB，部署在 GitHub Pages 时使用） ----------
import seedRows from "../foods.json";
type SeedRow = [string, string, number, number, number, number, number | null, number | null, string];
const SEED_FOODS: Food[] = (seedRows as SeedRow[]).map(([name, category, per100, protein, carb, fat, fiber, sugar, aliases], i) => ({
  id: i + 1, name, category, aliases, per100, protein, carb, fat, fiber, sugar, source: "cfct", is_favorite: 0,
}));

type LocalState = {
  profile: Profile;
  customFoods: Food[];
  favIds: number[];
  weights: Record<string, number>;
  water: Record<string, number>;
  exercises: Exercise[];
  nextEntryId: number;
  nextFoodId: number;
};

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open("fitlog", 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("days")) db.createObjectStore("days");
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const rq = db.transaction(store, "readonly").objectStore(store).get(key);
    rq.onsuccess = () => res(rq.result as T | undefined);
    rq.onerror = () => rej(rq.error);
  });
}
function idbSet(db: IDBDatabase, store: string, key: string, val: any): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const EMPTY_STATE: LocalState = { profile: null, customFoods: [], favIds: [], weights: {}, water: {}, exercises: [], nextEntryId: 1, nextFoodId: 1 };

export class LocalStore implements Store {
  readonly kind = "local" as const;
  private db!: IDBDatabase;
  private state!: LocalState;

  async init() {
    this.db = await idbOpen();
    this.state = { ...EMPTY_STATE, ...((await idbGet<LocalState>(this.db, "kv", "state")) || {}) };
    if ("serviceWorker" in navigator) {
      try { if (await navigator.storage?.persist?.()) void 0; } catch {}
    }
  }
  private async saveState() { await idbSet(this.db, "kv", "state", this.state); }
  private async getDayEntries(date: string): Promise<Entry[]> { return (await idbGet<Entry[]>(this.db, "days", date)) || []; }
  private async setDayEntries(date: string, rows: Entry[]) { await idbSet(this.db, "days", date, rows); }
  private allFoods(): Food[] {
    return [...this.state.customFoods, ...SEED_FOODS].map((f) => ({
      ...f,
      is_favorite: this.state.favIds.includes(f.id) ? 1 : 0,
    }));
  }
  private targetsFromProfile(): Targets | null {
    const p = this.state.profile;
    if (!p) return null;
    return { kcal: p.target_kcal || 0, protein: p.target_protein || 0, carb: p.target_carb || 0, fat: p.target_fat || 0, bmr: 0, tdee: 0 };
  }

  async getDay(date: string): Promise<DayBundle> {
    const entries = await this.getDayEntries(date);
    const totals = entries.reduce((t, e) => ({ kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carb: t.carb + e.carb, fat: t.fat + e.fat }), { kcal: 0, protein: 0, carb: 0, fat: 0 });
    for (const k of Object.keys(totals) as (keyof Totals)[]) totals[k] = Math.round(totals[k]);
    const exercise = this.state.exercises.filter((e) => e.date === date);
    return {
      entries, totals,
      water_ml: this.state.water[date] || 0,
      exercise,
      exercise_kcal: Math.round(exercise.reduce((s, e) => s + e.kcal, 0)),
    };
  }
  async addEntries(date: string, meal: Meal, items: { name: string; grams: number; per100: Per100; source: "db" | "ai" | "manual"; food_id?: number | null }[], thumb?: string | null): Promise<number> {
    const rows = await this.getDayEntries(date);
    let n = 0, thumbUsed = false;
    for (const it of items) {
      if (!it.name || !(it.grams > 0)) continue;
      const t = !thumbUsed && thumb ? thumb : null;
      if (t) thumbUsed = true;
      rows.push({
        id: this.state.nextEntryId++, date, meal, food_id: it.food_id ?? null, food_name: it.name,
        grams: it.grams, per100: r1(it.per100.kcal), per100_protein: r1(it.per100.protein),
        per100_carb: r1(it.per100.carb), per100_fat: r1(it.per100.fat),
        kcal: Math.round((it.per100.kcal * it.grams) / 100),
        protein: r1((it.per100.protein * it.grams) / 100),
        carb: r1((it.per100.carb * it.grams) / 100),
        fat: r1((it.per100.fat * it.grams) / 100),
        source: it.source, thumb: t,
      });
      n++;
    }
    await this.setDayEntries(date, rows);
    await this.saveState();
    return n;
  }
  async deleteEntry(date: string, id: number) {
    await this.setDayEntries(date, (await this.getDayEntries(date)).filter((e) => e.id !== id));
  }
  async patchEntry(date: string, id: number, grams: number) {
    const rows = await this.getDayEntries(date);
    const e = rows.find((x) => x.id === id);
    if (e) {
      e.grams = grams;
      e.kcal = Math.round((e.per100 * grams) / 100);
      e.protein = r1((e.per100_protein * grams) / 100);
      e.carb = r1((e.per100_carb * grams) / 100);
      e.fat = r1((e.per100_fat * grams) / 100);
      await this.setDayEntries(date, rows);
    }
  }
  async copyMeal(from: string, to: string, meal: Meal): Promise<number> {
    const src = (await this.getDayEntries(from)).filter((e) => e.meal === meal);
    const dst = await this.getDayEntries(to);
    for (const e of src) dst.push({ ...e, id: this.state.nextEntryId++, date: to });
    await this.setDayEntries(to, dst);
    await this.saveState();
    return src.length;
  }
  async searchFoods(q: string): Promise<Food[]> {
    const loggedIds = new Set<number>();
    for (const d of Object.keys(await this.allDaysMap())) {
      for (const e of await this.getDayEntries(d)) if (e.food_id) loggedIds.add(e.food_id);
    }
    const foods = this.allFoods().map((f) => ({ ...f, logged: loggedIds.has(f.id) ? 1 : 0 }));
    const query = normalizeName(q);
    if (!query) return foods.filter((f) => f.is_favorite).concat(foods.filter((f) => !f.is_favorite));
    return foods
      .map((f) => ({ f, s: scoreFood(f, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.f);
  }
  async addCustomFood(f: { name: string; category: string; per100: Per100; aliases?: string; fiber?: number | null; sugar?: number | null; off_grade?: string | null }): Promise<Food> {
    const all = this.allFoods();
    const dup = all.find((x) => scoreFood(x, f.name) >= 100);
    if (dup && dup.source === "cfct") throw new Error(`食物库已有「${dup.name}」`);
    if (dup) return dup; // 已录过（自定义/全球库），直接复用避免重复
    const row: Food = {
      id: 1000 + this.state.nextFoodId++, name: f.name.trim(), category: f.category || "自定义",
      aliases: f.aliases || "", per100: r1(f.per100.kcal), protein: r1(f.per100.protein),
      carb: r1(f.per100.carb), fat: r1(f.per100.fat), fiber: f.fiber ?? null, sugar: f.sugar ?? null,
      off_grade: f.off_grade ?? null, source: "custom", is_favorite: 0,
    };
    this.state.customFoods.push(row);
    await this.saveState();
    return row;
  }
  async toggleFavorite(id: number): Promise<void> {
    const i = this.state.favIds.indexOf(id);
    if (i >= 0) this.state.favIds.splice(i, 1);
    else this.state.favIds.push(id);
    await this.saveState();
  }
  async getProfile(): Promise<Profile> { return this.state.profile; }
  async saveProfile(p: Parameters<Store["saveProfile"]>[0]): Promise<Targets> {
    const t = calcTargets(p);
    this.state.profile = {
      sex: p.sex ?? null, age: p.age ?? null, height: p.height ?? null, weight: p.weight ?? null,
      activity: p.activity || "mid", deficit: p.deficit ?? 300, auto: p.auto === false ? 0 : 1,
      target_kcal: t.kcal, target_protein: t.protein, target_carb: t.carb, target_fat: t.fat,
    };
    if (p.weight && p.date) this.state.weights[p.date] = p.weight;
    await this.saveState();
    return t;
  }
  async setWater(date: string, deltaMl: number): Promise<void> {
    this.state.water[date] = Math.max(0, (this.state.water[date] || 0) + deltaMl);
    await this.saveState();
  }
  async addExercise(date: string, e: { name: string; minutes: number; kcal: number }): Promise<void> {
    this.state.exercises.push({ id: this.state.nextEntryId++, date, ...e });
    await this.saveState();
  }
  async deleteExercise(id: number): Promise<void> {
    this.state.exercises = this.state.exercises.filter((e) => e.id !== id);
    await this.saveState();
  }
  async getWeights(days: number): Promise<{ date: string; weight: number }[]> {
    const start = fmtDate(new Date(Date.now() - (days - 1) * 86400000));
    return Object.entries(this.state.weights)
      .filter(([d]) => d >= start)
      .map(([date, weight]) => ({ date, weight }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async addWeight(date: string, weight: number): Promise<Targets | null> {
    this.state.weights[date] = weight;
    if (this.state.profile) {
      const p = this.state.profile;
      const t = calcTargets({ ...p, weight, auto: !!p.auto });
      this.state.profile = { ...p, weight, target_kcal: t.kcal, target_protein: t.protein, target_carb: t.carb, target_fat: t.fat };
      await this.saveState();
      return t;
    }
    await this.saveState();
    return null;
  }
  async getStats(days: number): Promise<{ days: StatDay[]; targets: Targets | null }> {
    const daysMap = await this.allDaysMap();
    const list: StatDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = fmtDate(new Date(Date.now() - i * 86400000));
      const rows = daysMap[date] || [];
      const exercise = this.state.exercises.filter((e) => e.date === date);
      list.push({
        date,
        kcal: Math.round(rows.reduce((s, e) => s + e.kcal, 0)),
        protein: Math.round(rows.reduce((s, e) => s + e.protein, 0)),
        carb: Math.round(rows.reduce((s, e) => s + e.carb, 0)),
        fat: Math.round(rows.reduce((s, e) => s + e.fat, 0)),
        exercise_kcal: Math.round(exercise.reduce((s, e) => s + e.kcal, 0)),
        water_ml: this.state.water[date] || 0,
        weight: this.state.weights[date] ?? null,
      });
    }
    return { days: list, targets: this.targetsFromProfile() };
  }
  async recognize(imageDataUrl: string): Promise<RecogItem[]> {
    const text = await glmVision(imageDataUrl, FOOD_PROMPT);
    const arr = extractJson(text);
    if (!Array.isArray(arr)) throw new Error("AI 返回格式异常，请重试一次");
    const foods = this.allFoods();
    return arr.filter((it: any) => it && it.name).slice(0, 10).map((it: any) => {
      const q = normalizeName(it.name);
      let best: Food | null = null, bestScore = 0;
      for (const f of foods) {
        const s = scoreFood(f, it.name);
        if (s > bestScore) { bestScore = s; best = f; }
      }
      const match = bestScore >= 45 ? best : null;
      const per100: Per100 = match
        ? { kcal: match.per100, protein: match.protein, carb: match.carb, fat: match.fat }
        : { kcal: r1(it.per100?.kcal), protein: r1(it.per100?.protein), carb: r1(it.per100?.carb), fat: r1(it.per100?.fat) };
      return computeItem(match ? match.name : String(it.name), Math.max(Math.round(Number(it.grams) || 100), 1), per100, match ? "db" : "ai", match ? match.id : null, Number(it.confidence) || 0, it.kind === "dish" ? "dish" : "basic");
    });
  }
  async parseLabel(imageDataUrl: string): Promise<{ name: string | null; serving_g: number | null; per100: Per100 }> {
    const text = await glmVision(imageDataUrl, LABEL_PROMPT, 500);
    const m = extractJson(text);
    if (!m || !m.per100) throw new Error("未能识别出营养成分表，请正对表格重拍");
    return {
      name: m.name || null,
      serving_g: m.serving_g ? Number(m.serving_g) : null,
      per100: {
        kcal: Math.round((Number(m.per100.kj) / 4.184) * 10) / 10,
        protein: Number(m.per100.protein) || 0,
        carb: Number(m.per100.carb) || 0,
        fat: Number(m.per100.fat) || 0,
      },
    };
  }
  async exportAll(): Promise<string> {
    return JSON.stringify({ version: 1, exported_at: new Date().toISOString(), state: this.state, days: await this.allDaysMap() }, null, 1);
  }
  async importAll(json: string): Promise<void> {
    const data = JSON.parse(json);
    if (!data || !data.state) throw new Error("备份文件格式不对");
    this.state = { ...EMPTY_STATE, ...data.state };
    for (const [date, rows] of Object.entries(data.days || {})) await idbSet(this.db, "days", date, rows);
    await this.saveState();
  }
  private async allDaysMap(): Promise<Record<string, Entry[]>> {
    return new Promise((res, rej) => {
      const out: Record<string, Entry[]> = {};
      const rq = this.db.transaction("days", "readonly").objectStore("days").openCursor();
      rq.onsuccess = () => {
        const cur = rq.result;
        if (cur) { out[String(cur.key)] = cur.value as Entry[]; cur.continue(); }
        else res(out);
      };
      rq.onerror = () => rej(rq.error);
    });
  }
}

// ---------- 启动时选择存储模式 ----------
export async function detectStore(): Promise<{ store: Store; needPin: boolean }> {
  try {
    const r = await fetch("/api/health", { signal: AbortSignal.timeout(1500) });
    const isJson = (r.headers.get("content-type") || "").includes("application/json");
    if (r.ok && isJson) return { store: new ServerStore(), needPin: false };
    if (r.status === 401) return { store: new ServerStore(), needPin: true };
  } catch {}
  const ls = new LocalStore();
  await ls.init();
  return { store: ls, needPin: false };
}
