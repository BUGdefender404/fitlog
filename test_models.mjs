// 实测智谱 API：验证 key 有效性 + 免费视觉模型可用性
const KEY = process.env.ZHIPU_KEY;
const BASE = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

import { readFileSync } from "node:fs";
const b64 = readFileSync("./test_image.jpg").toString("base64");
const dataUrl = `data:image/jpeg;base64,${b64}`;

async function call(model, content) {
  const t0 = Date.now();
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens: 500 }),
  });
  const ms = Date.now() - t0;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { model, status: res.status, error: j.error?.message || JSON.stringify(j).slice(0, 200) };
  const msg = j.choices?.[0]?.message?.content ?? "";
  return { model, status: res.status, ms, usage: j.usage, content: String(msg).slice(0, 300) };
}

const results = [];
results.push(await call("glm-4-flash", "只回复两个字：可用"));
results.push(
  await call("glm-4v-flash", [
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: "用一句话描述这张图片的内容" },
  ])
);
results.push(
  await call("glm-4.6v-flash", [
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: "用一句话描述这张图片的内容" },
  ])
);

for (const r of results) console.log(JSON.stringify(r, null, 2), "\n---");
