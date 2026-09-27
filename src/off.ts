// Open Food Facts 全球开源食物库客户端
// 数据源即 mcpworld 收录的 openfoodfacts-mcp 背后的同一 API（world.openfoodfacts.org，ODbL 开放协议）。
// 免密钥、CORS 全开，浏览器可直连；适合包装食品（有条码的商品）。
import type { Per100 } from "./api";

const OFF_BASE = "https://world.openfoodfacts.org";
const FIELDS = ["code", "product_name", "product_name_zh", "brands", "categories", "nutriments", "nutriscore_grade", "serving_quantity", "serving_unit"].join(",");

export type OffHit = {
  code: string; name: string; brand: string; category: string;
  per100: Per100; fiber: number | null; sugar: number | null;
  nutriscore: string | null; serving: string;
};

const num = (v: any): number | null => (Number.isFinite(Number(v)) && String(v ?? "") !== "" ? Number(v) : null);
const r1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);

function toHit(p: any): OffHit | null {
  const n = p?.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy_100g"]);
    if (kj == null) return null; // 没有能量数据的残缺条目直接丢弃
    kcal = Math.round((kj / 4.184) * 10) / 10;
  }
  const name = String(p.product_name_zh || p.product_name || "").trim();
  if (!name) return null;
  const cats = String(p.categories || "");
  const isDrink = /beverage|drink|soda|juice|\btea\b|\bwater\b|coffee|leche|boisson/i.test(cats) || /饮料|饮品|奶茶|汽水|果汁|饮用水/.test(cats);
  return {
    code: String(p.code || ""),
    name,
    brand: String(p.brands || "").split(",")[0].trim(),
    category: isDrink ? "饮品" : "包装食品",
    per100: {
      kcal: Math.round(kcal * 10) / 10,
      protein: r1(num(n.proteins_100g)) ?? 0,
      carb: r1(num(n.carbohydrates_100g)) ?? 0,
      fat: r1(num(n.fat_100g)) ?? 0,
    },
    fiber: r1(num(n.fiber_100g)),
    sugar: r1(num(n.sugars_100g)),
    nutriscore: /^[abcde]$/.test(String(p.nutriscore_grade)) ? p.nutriscore_grade : null,
    serving: num(p.serving_quantity) != null ? `${p.serving_quantity}${p.serving_unit || "g"}` : "",
  };
}

async function offFetch(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`全球食物库请求失败（${res.status}）`);
  return res.json();
}

// 关键词搜商品（中文/英文均可）；有 Nutri-Score 的排前，同分按热量低者优先
export async function offSearch(q: string, signal?: AbortSignal): Promise<OffHit[]> {
  const d = await offFetch(
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
    signal
  );
  return ((d.products || []) as any[])
    .map(toHit)
    .filter((x): x is OffHit => !!x)
    .sort((a, b) => Number(!!b.nutriscore) - Number(!!a.nutriscore) || a.per100.kcal - b.per100.kcal)
    .slice(0, 8);
}

// 按条码精确查询
export async function offProduct(code: string, signal?: AbortSignal): Promise<OffHit | null> {
  const d = await offFetch(`${OFF_BASE}/api/v2/product/${encodeURIComponent(code.trim())}.json?fields=${FIELDS}`, signal);
  if (d.status === 0 || !d.product) return null;
  return toHit(d.product);
}
