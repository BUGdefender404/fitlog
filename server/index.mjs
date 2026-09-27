// 轻食记 后端服务：Hono + node:sqlite + 智谱 GLM-4V
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------- env ----------
function loadEnv() {
  try {
    const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

// ---------- 数据库 ----------
mkdirSync("data", { recursive: true });
const db = new DatabaseSync(path.join(process.cwd(), "data", "fitlog.db"));
db.exec("PRAGMA journal_mode=WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  aliases TEXT DEFAULT '',
  per100 REAL NOT NULL,
  protein REAL NOT NULL,
  carb REAL NOT NULL,
  fat REAL NOT NULL,
  fiber REAL,
  sugar REAL,
  off_grade TEXT,
  source TEXT DEFAULT 'cfct',
  is_favorite INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  food_id INTEGER,
  food_name TEXT NOT NULL,
  grams REAL NOT NULL,
  per100 REAL NOT NULL,
  per100_protein REAL NOT NULL,
  per100_carb REAL NOT NULL,
  per100_fat REAL NOT NULL,
  kcal REAL NOT NULL,
  protein REAL NOT NULL,
  carb REAL NOT NULL,
  fat REAL NOT NULL,
  source TEXT DEFAULT 'db',
  thumb TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sex TEXT, age INTEGER, height REAL, weight REAL,
  activity TEXT DEFAULT 'mid',
  deficit INTEGER DEFAULT 300,
  auto INTEGER DEFAULT 1,
  target_kcal REAL, target_protein REAL, target_carb REAL, target_fat REAL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS weights (
  date TEXT PRIMARY KEY,
  weight REAL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  minutes REAL NOT NULL,
  kcal REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS water (
  date TEXT PRIMARY KEY,
  ml INTEGER DEFAULT 0
);
`);
// 迁移：为存量库补充 膳食纤维/糖/Nutri-Score 字段
const foodCols = db.prepare("PRAGMA table_info(foods)").all().map((c) => c.name);
if (!foodCols.includes("fiber")) db.exec("ALTER TABLE foods ADD COLUMN fiber REAL");
if (!foodCols.includes("sugar")) db.exec("ALTER TABLE foods ADD COLUMN sugar REAL");
if (!foodCols.includes("off_grade")) db.exec("ALTER TABLE foods ADD COLUMN off_grade TEXT");

const seed = JSON.parse(readFileSync(path.join(process.cwd(), "foods.json"), "utf8"));
if (!db.prepare("SELECT COUNT(*) AS c FROM foods").get().c) {
  const ins = db.prepare(
    "INSERT INTO foods (name, category, per100, protein, carb, fat, aliases, fiber, sugar) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const [name, cat, per100, protein, carb, fat, fiber, sugar, aliases] of seed)
    ins.run(name, cat, per100, protein, carb, fat, aliases, fiber, sugar);
  console.log(`食物库已导入 ${seed.length} 条`);
} else {
  // 按《中国食物成分表》刷新种子数据（含新增纤维/糖维度），自定义食物不受影响
  const upd = db.prepare(
    "UPDATE foods SET category=?, per100=?, protein=?, carb=?, fat=?, aliases=?, fiber=?, sugar=? WHERE name=? AND source='cfct'"
  );
  let n = 0;
  for (const [name, cat, per100, protein, carb, fat, fiber, sugar, aliases] of seed)
    n += upd.run(cat, per100, protein, carb, fat, aliases, fiber, sugar, name).changes;
  console.log(`食物库已刷新 ${n} 条种子数据`);
}

// ---------- 工具 ----------
const r1 = (x) => Math.round(Number(x || 0) * 10) / 10;
const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\s,，。、·（）()\[\]【】_'"“”?!！？:：\-—]/g, "");

let foodCache = null;
function getFoods() {
  if (!foodCache) foodCache = db.prepare("SELECT * FROM foods").all().map((f) => ({ ...f, norm: normalize(f.name) }));
  return foodCache;
}
const invalidateFoods = () => (foodCache = null);

// 名称模糊匹配：精确 > 名称包含 > 别名匹配
function matchFood(name) {
  const n = normalize(name);
  if (!n) return null;
  const foods = getFoods();
  let best = null, bestScore = 0;
  for (const f of foods) {
    let s = 0;
    if (f.norm === n) s = 100;
    else if (n.length >= 2 && f.norm.includes(n)) s = 80 + Math.min(n.length, 6);
    else if (f.norm.length >= 2 && n.includes(f.norm)) s = 70 + Math.min(f.norm.length, 6);
    else {
      for (const a of String(f.aliases || "").split(",")) {
        const an = normalize(a);
        if (!an) continue;
        if (an === n) { s = Math.max(s, 60); break; }
        if (n.length >= 2 && an.includes(n)) s = Math.max(s, 50);
        else if (an.length >= 2 && n.includes(an)) s = Math.max(s, 45);
      }
    }
    if (s > bestScore) { bestScore = s; best = f; }
  }
  return bestScore >= 45 ? best : null;
}

function calcTargets({ sex, age, height, weight, activity, deficit, auto, target_kcal }) {
  const w = Number(weight) || 60;
  const bmr = 10 * w + 6.25 * Number(height) - 5 * Number(age) + (sex === "male" ? 5 : -161);
  const factor = { low: 1.2, mid: 1.375, high: 1.55, very: 1.725 }[activity] || 1.375;
  const tdee = bmr * factor;
  const floor = sex === "female" ? 1200 : 1500;
  let kcal, protein, fat, carb;
  if (auto) {
    kcal = Math.max(tdee - (Number(deficit) || 300), floor);
    protein = Math.round(1.6 * w);
  } else {
    kcal = Math.max(Number(target_kcal) || 1600, floor);
    protein = Math.round(1.6 * w);
  }
  fat = Math.round((kcal * 0.25) / 9);
  carb = Math.max(Math.round((kcal - protein * 4 - fat * 9) / 4), 0);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein, fat, carb };
}

const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------- 智谱识别 ----------
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const FOOD_PROMPT = `你是食物营养分析助手。识别图片中的所有食物和饮品（忽略餐具、人、桌面）。
对每种食物估计份量与营养成分。只输出一个 JSON 数组，不要输出任何其他文字、注释或代码块标记。
格式：[{"name":"中文食物名(简短,如:米饭/鸡胸肉/宫保鸡丁)","grams":估计克数,"per100":{"kcal":每100克千卡,"protein":每100克蛋白质克,"carb":每100克碳水克,"fat":每100克脂肪克},"confidence":0到1,"kind":"basic或dish"}]
kind: basic=基础食材(蛋/肉/蔬菜/水果/主食/奶等), dish=混合烹饪的菜。若图片中没有食物，输出 []`;
const LABEL_PROMPT = `你是食品营养成分表识别助手。识别图片中包装上的"营养成分表"表格。只输出一个 JSON 对象，不要输出任何其他文字：
{"name":"产品名(包装上可见则填,否则null)","per100":{"kj":每100克或每100毫升的能量(千焦,数字),"protein":蛋白质(克),"fat":脂肪(克),"carb":碳水化合物(克)},"serving_g":每份规格克数(表格无"每份"列则为null)}
注意：若表格只有"每份"一列没有"每100g"列，则将数值填入per100，并把每份克数填入serving_g。钠含量忽略。`;
async function callGLM(imageDataUrl, prompt, maxTokens = 1024) {
  const model = process.env.ZHIPU_MODEL || "glm-4v-flash";
  const res = await fetch(GLM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }, { type: "text", text: prompt }] },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `GLM 接口错误 ${res.status}`);
  return String(j.choices?.[0]?.message?.content ?? "");
}
function extractJsonArray(text) {
  text = text.replace(/```json|```/g, "").trim();
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
function extractJsonObject(text) {
  text = text.replace(/```json|```/g, "").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

// ---------- 路由 ----------
const app = new Hono();

// 访问口令保护：.env 里配置 ACCESS_PIN 后，所有 /api 请求必须携带 x-pin 头
const PIN = (process.env.ACCESS_PIN || "").trim();
app.use("/api/*", async (c, next) => {
  if (PIN && c.req.header("x-pin") !== PIN) return c.json({ error: "需要访问口令" }, 401);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, model: process.env.ZHIPU_MODEL || "glm-4v-flash" }));

// 拍照识别：返回可编辑的卡片（不直接入库）
app.post("/api/recognize", async (c) => {
  try {
    const { image } = await c.req.json();
    if (!image || typeof image !== "string") return c.json({ error: "缺少图片" }, 400);
    const text = await callGLM(image, FOOD_PROMPT);
    const arr = extractJsonArray(text);
    if (!arr) return c.json({ error: "AI 返回格式异常，请重试一次" }, 502);
    const items = arr
      .filter((it) => it && it.name)
      .slice(0, 10)
      .map((it) => {
        const match = matchFood(it.name);
        const per100 = match
          ? { kcal: match.per100, protein: match.protein, carb: match.carb, fat: match.fat }
          : {
              kcal: r1(it.per100?.kcal) || 0,
              protein: r1(it.per100?.protein) || 0,
              carb: r1(it.per100?.carb) || 0,
              fat: r1(it.per100?.fat) || 0,
            };
        const grams = Math.max(Math.round(Number(it.grams) || 100), 1);
        return {
          food_id: match ? match.id : null,
          name: match ? match.name : String(it.name),
          grams,
          per100,
          confidence: Number(it.confidence) || 0,
          kind: it.kind === "dish" ? "dish" : "basic",
          source: match ? "db" : "ai",
          kcal: r1((per100.kcal * grams) / 100),
          protein: r1((per100.protein * grams) / 100),
          carb: r1((per100.carb * grams) / 100),
          fat: r1((per100.fat * grams) / 100),
        };
      });
    return c.json({ items, model: process.env.ZHIPU_MODEL || "glm-4v-flash" });
  } catch (e) {
    return c.json({ error: e.message || "识别失败" }, 500);
  }
});

// 手动添加一条记录
app.post("/api/entries", async (c) => {
  const b = await c.req.json();
  const kcal = r1((b.per100.kcal * b.grams) / 100);
  const ins = db.prepare(
    `INSERT INTO entries (date, meal, food_id, food_name, grams, per100, per100_protein, per100_carb, per100_fat,
      kcal, protein, carb, fat, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const r = ins.run(
    b.date, b.meal, b.food_id ?? null, b.name, Number(b.grams) || 100,
    b.per100.kcal, b.per100.protein, b.per100.carb, b.per100.fat,
    kcal, r1((b.per100.protein * b.grams) / 100), r1((b.per100.carb * b.grams) / 100), r1((b.per100.fat * b.grams) / 100),
    b.source || "db"
  );
  return c.json({ id: Number(r.lastInsertRowid) });
});

// 拍照识别结果批量入库（AI 估算项同时沉淀为自定义食物，下次匹配库内数据）
app.post("/api/entries/batch", async (c) => {
  const b = await c.req.json();
  const items = Array.isArray(b.items) ? b.items.slice(0, 10) : [];
  if (!items.length) return c.json({ count: 0 });
  const insEntry = db.prepare(
    `INSERT INTO entries (date, meal, food_id, food_name, grams, per100, per100_protein, per100_carb, per100_fat,
      kcal, protein, carb, fat, source, thumb) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const insFood = db.prepare(
    `INSERT INTO foods (name, category, per100, protein, carb, fat, source) VALUES (?,?,?,?,?,?,'ai')`
  );
  let thumbUsed = false, count = 0;
  for (const it of items) {
    if (!it.name || !(it.grams > 0)) continue;
    let foodId = it.food_id ?? null;
    if (!foodId) {
      const exists = matchFood(it.name);
      if (exists) foodId = exists.id;
      else {
        const r = insFood.run(String(it.name), "自定义", r1(it.per100?.kcal) || 0, r1(it.per100?.protein) || 0,
          r1(it.per100?.carb) || 0, r1(it.per100?.fat) || 0);
        foodId = Number(r.lastInsertRowid);
        invalidateFoods();
      }
    }
    const thumb = !thumbUsed && b.thumb ? b.thumb : null;
    if (thumb) thumbUsed = true;
    insEntry.run(
      b.date, b.meal, foodId, String(it.name), Number(it.grams),
      r1(it.per100?.kcal) || 0, r1(it.per100?.protein) || 0, r1(it.per100?.carb) || 0, r1(it.per100?.fat) || 0,
      r1((it.per100?.kcal * it.grams) / 100), r1((it.per100?.protein * it.grams) / 100),
      r1((it.per100?.carb * it.grams) / 100), r1((it.per100?.fat * it.grams) / 100),
      it.source || "ai", thumb
    );
    count++;
  }
  return c.json({ count });
});

// 某日记录 + 汇总 + 饮水 + 运动
app.get("/api/entries", (c) => {
  const date = c.req.query("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return c.json({ error: "date 参数格式应为 YYYY-MM-DD" }, 400);
  const rows = db
    .prepare("SELECT * FROM entries WHERE date = ? ORDER BY id")
    .all(date);
  const totals = rows.reduce(
    (t, e) => ({
      kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carb: t.carb + e.carb, fat: t.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 }
  );
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
  const w = db.prepare("SELECT COALESCE(ml, 0) AS ml FROM water WHERE date = ?").get(date);
  const exercise = db.prepare("SELECT * FROM exercises WHERE date = ? ORDER BY id").all(date);
  return c.json({
    entries: rows, totals,
    water_ml: w ? w.ml : 0,
    exercise,
    exercise_kcal: Math.round(exercise.reduce((s, e) => s + e.kcal, 0)),
  });
});

app.delete("/api/entries/:id", (c) => {
  db.prepare("DELETE FROM entries WHERE id = ?").run(Number(c.req.param("id")));
  return c.json({ ok: true });
});

app.patch("/api/entries/:id", async (c) => {
  const b = await c.req.json();
  const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(Number(c.req.param("id")));
  if (!row) return c.json({ error: "记录不存在" }, 404);
  const grams = Number(b.grams) || row.grams;
  db.prepare(
    `UPDATE entries SET grams=?, kcal=?, protein=?, carb=?, fat=? WHERE id=?`
  ).run(grams,
    r1((row.per100 * grams) / 100), r1((row.per100_protein * grams) / 100),
    r1((row.per100_carb * grams) / 100), r1((row.per100_fat * grams) / 100), row.id);
  return c.json({ ok: true });
});

// 档案与目标
app.get("/api/profile", (c) => {
  const p = db.prepare("SELECT * FROM profile WHERE id = 1").get() || null;
  return c.json({ profile: p });
});
app.post("/api/profile", async (c) => {
  const b = await c.req.json();
  const targets = calcTargets(b);
  db.exec("DELETE FROM profile");
  db.prepare(
    `INSERT INTO profile (id, sex, age, height, weight, activity, deficit, auto, target_kcal, target_protein, target_carb, target_fat, updated_at)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`
  ).run(b.sex ?? null, Number(b.age) || null, Number(b.height) || null, Number(b.weight) || null,
    b.activity || "mid", Number(b.deficit) || 300, b.auto ? 1 : 0,
    targets.kcal, targets.protein, targets.carb, targets.fat);
  if (b.weight && /^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) {
    db.prepare("INSERT OR REPLACE INTO weights (date, weight) VALUES (?,?)").run(b.date, Number(b.weight));
  }
  return c.json({ targets });
});

// 食物库搜索（带"记录过"标记）
app.get("/api/foods", (c) => {
  const q = normalize(c.req.query("q"));
  const loggedIds = new Set(db.prepare("SELECT DISTINCT food_id FROM entries WHERE food_id IS NOT NULL").all().map((r) => r.food_id));
  const foods = getFoods().map((f) => ({ ...f, logged: loggedIds.has(f.id) ? 1 : 0 }));
  let list;
  if (!q) list = foods.filter((f) => f.is_favorite).concat(foods.filter((f) => !f.is_favorite));
  else
    list = foods
      .map((f) => {
        let s = 0;
        if (f.norm === q) s = 100;
        else if (f.norm.includes(q)) s = 80;
        else if (q.includes(f.norm) && f.norm.length >= 2) s = 70;
        else if (normalize(f.aliases).includes(q)) s = 60;
        return { f, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.f);
  return c.json(list.slice(0, 40));
});

// 自定义食物（用户按包装配料表录入 / 扫条码从 Open Food Facts 导入，per100 由前端换算好传入）
// 去重规则与手机本地模式一致：完全同名才拦截；带品牌后缀的条码商品视为不同条目
app.post("/api/foods", async (c) => {
  const b = await c.req.json();
  if (!b.name || !normalize(b.name)) return c.json({ error: "名称必填" }, 400);
  const nname = normalize(b.name);
  const exact = getFoods().find((f) => f.norm === nname);
  if (exact && exact.source === "cfct") return c.json({ error: `食物库已有「${exact.name}」` }, 409);
  if (exact) return c.json({ id: exact.id, food: exact }); // 已录过，直接复用
  const r = db.prepare(
    "INSERT INTO foods (name, category, per100, protein, carb, fat, aliases, fiber, sugar, off_grade, source) VALUES (?,?,?,?,?,?,?,?,?,?, 'custom')"
  ).run(String(b.name).trim(), String(b.category || "自定义"), Number(b.per100?.kcal) || 0,
    Number(b.per100?.protein) || 0, Number(b.per100?.carb) || 0, Number(b.per100?.fat) || 0,
    String(b.aliases || ""), b.fiber == null ? null : Number(b.fiber), b.sugar == null ? null : Number(b.sugar),
    b.off_grade ? String(b.off_grade) : null);
  invalidateFoods();
  const food = getFoods().find((f) => f.id === Number(r.lastInsertRowid));
  return c.json({ id: Number(r.lastInsertRowid), food });
});

// 收藏/取消收藏
app.post("/api/foods/:id/favorite", (c) => {
  db.prepare("UPDATE foods SET is_favorite = 1 - is_favorite WHERE id = ?").run(Number(c.req.param("id")));
  invalidateFoods();
  return c.json({ ok: true });
});

// 饮水（delta 可为负）
app.post("/api/water", async (c) => {
  const b = await c.req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return c.json({ error: "date 参数错误" }, 400);
  db.prepare(
    `INSERT INTO water (date, ml) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET ml = MAX(0, water.ml + excluded.ml)`
  ).run(b.date, Math.round(Number(b.ml) || 0));
  const row = db.prepare("SELECT ml FROM water WHERE date = ?").get(b.date);
  return c.json({ ml: row.ml });
});

// 运动
app.post("/api/exercise", async (c) => {
  const b = await c.req.json();
  if (!b.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return c.json({ error: "参数错误" }, 400);
  const r = db.prepare("INSERT INTO exercises (date, name, minutes, kcal) VALUES (?,?,?,?)")
    .run(b.date, String(b.name), Number(b.minutes) || 0, Math.round(Number(b.kcal) || 0));
  return c.json({ id: Number(r.lastInsertRowid) });
});
app.delete("/api/exercise/:id", (c) => {
  db.prepare("DELETE FROM exercises WHERE id = ?").run(Number(c.req.param("id")));
  return c.json({ ok: true });
});

// 体重
app.get("/api/weights", (c) => {
  const days = Math.min(Number(c.req.query("days")) || 30, 365);
  const start = fmtD(new Date(Date.now() - (days - 1) * 86400000));
  return c.json(db.prepare("SELECT date, weight FROM weights WHERE date >= ? ORDER BY date").all(start));
});
app.post("/api/weights", async (c) => {
  const b = await c.req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || !(Number(b.weight) > 0)) return c.json({ error: "参数错误" }, 400);
  db.prepare("INSERT OR REPLACE INTO weights (date, weight) VALUES (?,?)").run(b.date, Number(b.weight));
  const p = db.prepare("SELECT * FROM profile WHERE id = 1").get();
  if (p) {
    const targets = calcTargets({ ...p, weight: Number(b.weight), auto: !!p.auto });
    db.prepare(
      `UPDATE profile SET weight=?, target_kcal=?, target_protein=?, target_carb=?, target_fat=?, updated_at=datetime('now','localtime') WHERE id=1`
    ).run(Number(b.weight), targets.kcal, targets.protein, targets.carb, targets.fat);
    return c.json({ targets });
  }
  return c.json({ targets: null });
});

// 统计（近 N 天每日热量/营养素/运动/饮水/体重 + 目标）
app.get("/api/stats", (c) => {
  const days = Math.min(Number(c.req.query("days")) || 7, 90);
  const list = [];
  for (let i = days - 1; i >= 0; i--) list.push(fmtD(new Date(Date.now() - i * 86400000)));
  const ent = Object.fromEntries(
    db.prepare("SELECT date, SUM(kcal) kcal, SUM(protein) protein, SUM(carb) carb, SUM(fat) fat FROM entries WHERE date >= ? GROUP BY date")
      .all(list[0]).map((r) => [r.date, r])
  );
  const ex = Object.fromEntries(
    db.prepare("SELECT date, SUM(kcal) kcal FROM exercises WHERE date >= ? GROUP BY date").all(list[0]).map((r) => [r.date, r.kcal])
  );
  const wa = Object.fromEntries(db.prepare("SELECT date, ml FROM water WHERE date >= ?").all(list[0]).map((r) => [r.date, r.ml]));
  const wt = Object.fromEntries(db.prepare("SELECT date, weight FROM weights WHERE date >= ?").all(list[0]).map((r) => [r.date, r.weight]));
  const out = list.map((date) => {
    const e = ent[date] || {};
    return {
      date,
      kcal: Math.round(e.kcal || 0), protein: Math.round(e.protein || 0),
      carb: Math.round(e.carb || 0), fat: Math.round(e.fat || 0),
      exercise_kcal: Math.round(ex[date] || 0), water_ml: wa[date] || 0,
      weight: wt[date] ?? null,
    };
  });
  const p = db.prepare("SELECT * FROM profile WHERE id = 1").get() || null;
  return c.json({
    days: out,
    targets: p ? { kcal: p.target_kcal, protein: p.target_protein, carb: p.target_carb, fat: p.target_fat } : null,
  });
});

// 复制某天某餐的记录到另一天
app.post("/api/entries/copy", async (c) => {
  const b = await c.req.json();
  const rows = db.prepare("SELECT * FROM entries WHERE date = ? AND meal = ?").all(b.from, b.meal);
  const ins = db.prepare(
    `INSERT INTO entries (date, meal, food_id, food_name, grams, per100, per100_protein, per100_carb, per100_fat,
      kcal, protein, carb, fat, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const e of rows)
    ins.run(b.to, b.meal, e.food_id, e.food_name, e.grams, e.per100, e.per100_protein, e.per100_carb, e.per100_fat,
      e.kcal, e.protein, e.carb, e.fat, e.source);
  return c.json({ count: rows.length });
});

// 拍营养成分表 → 结构化数据（用于自定义食物预填）
app.post("/api/parse-label", async (c) => {
  try {
    const { image } = await c.req.json();
    if (!image || typeof image !== "string") return c.json({ error: "缺少图片" }, 400);
    const text = await callGLM(image, LABEL_PROMPT, 500);
    const m = extractJsonObject(text);
    if (!m || !m.per100) return c.json({ error: "未能识别出营养成分表，请正对表格重拍" }, 502);
    const kj = Number(m.per100.kj) || 0;
    return c.json({
      name: m.name || null,
      serving_g: m.serving_g ? Number(m.serving_g) : null,
      per100: {
        kcal: Math.round((kj / 4.184) * 10) / 10,
        protein: Number(m.per100.protein) || 0,
        carb: Number(m.per100.carb) || 0,
        fat: Number(m.per100.fat) || 0,
      },
    });
  } catch (e) {
    return c.json({ error: e.message || "识别失败" }, 500);
  }
});

// 静态资源（生产模式）
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ root: "./dist", rewriteRequestPath: () => "/index.html" }));

// ---------- 启动 ----------
const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`轻食记服务已启动: http://localhost:${port}`);
  const isVirtual = (name) => /zero.?tier|vmware|vmnet|virtualbox|vethernet|wsl|hyper-v|loopback|bluetooth/i.test(name);
  const isReal = (name) => /wlan|wi-?fi|以太网|ethernet|本地连接|无线/i.test(name);
  const cands = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal)
        cands.push({ name, addr: n.address, virtual: isVirtual(name), real: isReal(name) });
  // 优先选真实网卡（WLAN/以太网），跳过 ZeroTier/VMware 等虚拟网卡
  cands.sort((a, b) => (b.real ? 1 : 0) - (a.real ? 1 : 0) || (a.virtual ? 1 : 0) - (b.virtual ? 1 : 0));
  const best = cands[0];
  if (best) {
    const url = `http://${best.addr}:${port}`;
    console.log(`手机同 Wi-Fi 访问: ${url}`);
    if (cands.length > 1)
      console.log(`其他网卡地址（一般不用）: ${cands.slice(1).map((c) => `${c.addr}(${c.name})`).join(", ")}`);
    import("qrcode")
      .then((m) => m.default.toString(url, { type: "terminal", small: true }))
      .then((q) => console.log(q))
      .catch(() => {});
  }
});
