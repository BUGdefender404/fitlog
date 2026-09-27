import { useEffect, useRef, useState } from "react";
import { envInfo, Store, Targets, fmtDate, getApiKey, setApiKey } from "../api";

export default function MePage(props: {
  store: Store; targets: Targets | null; version: number;
  onTargetsChange: () => void; notify: (m: string) => void;
  install: { ready: boolean; prompt: () => Promise<void> };
}) {
  const { store, targets, onTargetsChange, notify, install } = props;
  const [f, setF] = useState({ sex: "male", age: "", height: "", weight: "", activity: "mid", deficit: 300, auto: true, target_kcal: "" });
  const [result, setResult] = useState<Targets | null>(targets);
  const [loaded, setLoaded] = useState(false);
  const [todayW, setTodayW] = useState("");
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [keySaved, setKeySaved] = useState(!!getApiKey());
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await store.getProfile();
        if (p) {
          setF({
            sex: p.sex || "male", age: String(p.age || ""), height: String(p.height || ""),
            weight: String(p.weight || ""), activity: p.activity || "mid", deficit: p.deficit || 300,
            auto: !!p.auto, target_kcal: p.auto ? "" : String(p.target_kcal || ""),
          });
          setResult({ kcal: p.target_kcal || 0, protein: p.target_protein || 0, carb: p.target_carb || 0, fat: p.target_fat || 0, bmr: 0, tdee: 0 });
        }
      } catch (e: any) { if (e?.name !== "AuthError") notify(e.message || ""); }
      finally { setLoaded(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  if (!loaded) return <div className="page" />;
  const set = (k: string, v: any) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    try {
      const t = await store.saveProfile({
        ...f, age: Number(f.age), height: Number(f.height), weight: Number(f.weight),
        auto: f.auto, target_kcal: Number(f.target_kcal) || 0, date: fmtDate(new Date()),
      });
      setResult(t); onTargetsChange(); notify("目标已更新");
    } catch (e: any) { notify(e.message || "保存失败"); }
  };
  const saveWeight = async () => {
    const w = Number(todayW);
    if (!(w > 20 && w < 300)) return notify("请输入合理的体重");
    try {
      const t = await store.addWeight(fmtDate(new Date()), w);
      set("weight", String(w));
      if (t) { setResult(t); onTargetsChange(); }
      notify("今日体重已记录");
    } catch (e: any) { notify(e.message || "记录失败"); }
  };
  const saveKey = () => { setApiKey(keyInput); setKeySaved(!!keyInput.trim()); notify(keyInput.trim() ? "API Key 已保存" : "已清除"); };
  const exportData = async () => {
    if (store.kind !== "local") return;
    const s = await (store as any).exportAll();
    const blob = new Blob([s], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitlog备份-${fmtDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify("备份已导出");
  };
  const importData = async (file?: File | null) => {
    if (!file || store.kind !== "local") return;
    try {
      await (store as any).importAll(await file.text());
      onTargetsChange(); notify("备份已导入");
    } catch (e: any) { notify(e.message || "导入失败"); }
  };

  return (
    <div className="page">
      <section className="card">
        <h2>身体档案</h2>
        <div className="form-row">
          <label>性别</label>
          <div className="seg">
            <button className={f.sex === "male" ? "on" : ""} onClick={() => set("sex", "male")}>男</button>
            <button className={f.sex === "female" ? "on" : ""} onClick={() => set("sex", "female")}>女</button>
          </div>
        </div>
        <div className="form-row"><label>年龄</label><input type="number" value={f.age} onChange={(e) => set("age", e.target.value)} /></div>
        <div className="form-row"><label>身高 (cm)</label><input type="number" value={f.height} onChange={(e) => set("height", e.target.value)} /></div>
        <div className="form-row"><label>当前体重 (kg)</label><input type="number" value={f.weight} onChange={(e) => set("weight", e.target.value)} /></div>
      </section>

      <section className="card">
        <h2>减脂目标</h2>
        <div className="form-row">
          <label>目标方式</label>
          <div className="seg">
            <button className={f.auto ? "on" : ""} onClick={() => set("auto", true)}>自动计算</button>
            <button className={!f.auto ? "on" : ""} onClick={() => set("auto", false)}>手动设置</button>
          </div>
        </div>
        {f.auto ? (
          <>
            <div className="form-row">
              <label>日常活动量</label>
              <select value={f.activity} onChange={(e) => set("activity", e.target.value)}>
                <option value="low">久坐（办公室，少运动）</option>
                <option value="mid">轻度（每周运动 1~3 次）</option>
                <option value="high">中等（每周运动 3~5 次）</option>
                <option value="very">较高（体力活/每天运动）</option>
              </select>
            </div>
            <div className="form-row">
              <label>每日热量缺口</label>
              <select value={f.deficit} onChange={(e) => set("deficit", Number(e.target.value))}>
                <option value={0}>0（先适应记录）</option>
                <option value={300}>300 千卡（温和，推荐）</option>
                <option value={500}>500 千卡（积极）</option>
              </select>
            </div>
          </>
        ) : (
          <div className="form-row"><label>每日目标 (千卡)</label><input type="number" value={f.target_kcal} onChange={(e) => set("target_kcal", e.target.value)} /></div>
        )}
        <button className="primary" onClick={save}>保存并计算目标</button>
        {result && (
          <div className="target-show">
            <div className="tk"><b>{result.kcal}</b><span>千卡/天</span></div>
            <div className="tm"><span>蛋白 {result.protein}g</span><span>碳水 {result.carb}g</span><span>脂肪 {result.fat}g</span></div>
            {result.bmr > 0 && <p className="note">基础代谢 {result.bmr} · 日常消耗约 {result.tdee} · 蛋白按 1.6g/kg、脂肪按 25% 热量配置</p>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>安装到手机桌面</h2>
        {(() => {
          const env = envInfo();
          const copyLink = () => {
            navigator.clipboard?.writeText(location.href).then(
              () => notify("网址已复制，去自带浏览器粘贴打开"),
              () => notify("复制失败，请在地址栏手动复制网址")
            );
          };
          const copyBtn = (
            <button className="ghost-line" style={{ marginTop: 10, display: "block", width: "100%" }} onClick={copyLink}>
              📋 复制本页网址，换浏览器打开
            </button>
          );
          if (env.standalone) return <p className="cf-note">✅ 当前已是 App 模式运行</p>;
          if (env.wechat)
            return <p className="cf-note">微信里无法添加桌面：点右上角「···」→「在浏览器打开」，然后在浏览器菜单里选「添加到主屏幕」</p>;
          if (env.ios && !env.safari)
            return (
              <div>
                <p className="cf-note">
                  你用的浏览器（夸克 / QQ 等）在 iPhone 上<b>没有「添加到主屏幕」功能</b>，只有自带的 Safari 可以：
                  ① 点下方按钮复制网址 → ② 打开 Safari 粘贴访问 → ③ 点底部「分享」⬆️ → 选「添加到主屏幕」
                </p>
                {copyBtn}
              </div>
            );
          if (env.ios && env.safari)
            return <p className="cf-note">点底部「分享」按钮 ⬆️ → 滑动找到「添加到主屏幕」→ 确认添加（找不到可往下滚动列表）</p>;
          if (install.ready) return <button className="primary" onClick={() => install.prompt()}>📲 一键安装 App</button>;
          if (env.quark || env.qqbrowser)
            return (
              <div>
                <p className="cf-note">
                  夸克 / QQ 浏览器：点底部「☰」菜单，找<b>「添加书签」或「添加到桌面」</b>；若只有书签，可在书签处<b>长按 → 发送到桌面</b>。
                  <br /><br />
                  点了没反应？多数是手机拦截了：设置 → 应用管理 → 该浏览器 → 权限 → 允许<b>「桌面快捷方式」</b>，再回来重试。
                  <br /><br />
                  还不行就用 Chrome 或 Edge 打开（对 App 安装支持最好）：
                </p>
                {copyBtn}
              </div>
            );
          return (
            <div>
              <p className="cf-note">在浏览器菜单里找「添加到主屏幕」或「安装应用」。若没有该选项，建议用 Chrome / Edge 打开本页：</p>
              {copyBtn}
            </div>
          );
        })()}
      </section>

      <section className="card">
        <h2>今日体重</h2>
        <div className="weight-row">
          <input type="number" inputMode="decimal" placeholder="如 72.5" value={todayW} onChange={(e) => setTodayW(e.target.value)} />
          <span>kg</span>
          <button className="primary small" onClick={saveWeight}>记录</button>
        </div>
        <p className="cf-note">记录体重会自动同步到目标计算（蛋白质按最新体重计算）</p>
      </section>

      {store.kind === "local" && (
        <section className="card">
          <h2>智谱 API Key（拍照识别用）</h2>
          <div className="weight-row">
            <input type="password" placeholder="粘贴智谱开放平台的 API Key" value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setKeySaved(false); }} />
            <button className="primary small" onClick={saveKey}>保存</button>
          </div>
          <p className="cf-note">
            {keySaved ? "✅ 已配置，免费模型 glm-4v-flash" : "到 open.bigmodel.cn 注册后创建 Key 粘贴到这里。Key 只保存在本机浏览器，不会上传"}
          </p>
        </section>
      )}

      <section className="card">
        <h2>数据</h2>
        <div className="form-row"><label>存储模式</label><span className="muted">{store.kind === "server" ? "电脑服务器（局域网）" : "本机浏览器（已装到手机时用这个）"}</span></div>
        {store.kind === "local" && (
          <div className="btn-row">
            <button className="ghost-line" onClick={exportData}>⬇️ 导出备份</button>
            <input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
            <button className="ghost-line" onClick={() => importRef.current?.click()}>⬆️ 导入备份</button>
          </div>
        )}
        {store.kind === "server" && <p className="cf-note">数据在电脑 data/fitlog.db，复制该文件即完成备份</p>}
      </section>

      <section className="card about">
        <h2>关于</h2>
        <p>轻食记 v1.2 · 食物营养数据参考《中国食物成分表》及中国营养学会营养健康查询平台（nlc.chinanutri.cn）、NutriData 营养数据库（nutridata.cn）；包装食品条码数据来自 Open Food Facts 全球开源食物库（world.openfoodfacts.org，ODbL 开放协议，Nutri-Score 分级映射红黄绿灯）。红黄绿分级按能量密度、蛋白质、膳食纤维、脂肪、糖综合判定。AI 识别由智谱 GLM-4V-Flash（免费档）提供，估算值仅供参考。</p>
      </section>
    </div>
  );
}
