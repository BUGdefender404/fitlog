import { useCallback, useEffect, useRef, useState } from "react";
import { Meal, Store, Targets, defaultMeal, fmtDate } from "./api";
import TodayPage from "./pages/Today";
import AddPage from "./pages/Add";
import StatsPage from "./pages/Stats";
import MePage from "./pages/Me";

export default function App({ store, needPin }: { store: Store; needPin: boolean }) {
  const [tab, setTab] = useState<"today" | "add" | "stats" | "me">("today");
  const [date, setDate] = useState(fmtDate(new Date()));
  const [targets, setTargets] = useState<Targets | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [pinOk, setPinOk] = useState(!needPin);
  const [toast, setToast] = useState("");
  const [addReq, setAddReq] = useState<{ date: string; meal: Meal }>({ date: fmtDate(new Date()), meal: defaultMeal() });
  const [installEvt, setInstallEvt] = useState<any>(null);
  const toastTimer = useRef<number>(0);

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => { setInstallEvt(null); notify("轻食记已安装到桌面 🎉"); });
    return () => window.removeEventListener("beforeinstallprompt", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const p = await store.getProfile();
      setHasProfile(!!p);
      if (p)
        setTargets({ kcal: p.target_kcal || 0, protein: p.target_protein || 0, carb: p.target_carb || 0, fat: p.target_fat || 0, bmr: 0, tdee: 0 });
    } catch (e: any) {
      if (e?.name === "AuthError") setPinOk(false);
    } finally {
      setProfileLoaded(true);
    }
  }, [store]);
  useEffect(() => { if (pinOk) loadProfile(); }, [pinOk, loadProfile]);

  const openAdd = useCallback((d: string, m: Meal) => {
    setAddReq({ date: d, meal: m });
    setTab("add");
  }, []);
  const onSaved = useCallback(async (msg: string) => {
    notify(msg);
    setVersion((v) => v + 1);
    setTab("today");
  }, [notify]);

  if (!pinOk)
    return (
      <div className="app">
        <PinGate onOk={() => setPinOk(true)} />
      </div>
    );
  if (!profileLoaded) return <div className="app"><div className="boot">加载中…</div></div>;

  return (
    <div className="app">
      <main className="content">
        {tab === "today" && (
          <TodayPage store={store} date={date} setDate={setDate} targets={targets} hasProfile={hasProfile}
            version={version} notify={notify} openAdd={openAdd} />
        )}
        {tab === "add" && (
          <AddPage key={addReq.date + addReq.meal} store={store} date={addReq.date} meal={addReq.meal}
            notify={notify} onSaved={onSaved} />
        )}
        {tab === "stats" && <StatsPage store={store} version={version} />}
        {tab === "me" && (
          <MePage store={store} targets={targets} version={version} onTargetsChange={loadProfile} notify={notify}
            install={{ ready: !!installEvt, prompt: async () => { if (installEvt) { installEvt.prompt(); setInstallEvt(null); } } }} />
        )}
      </main>
      <nav className="tabbar">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}><i>📋</i>今日</button>
        <button className={tab === "add" ? "on" : ""} onClick={() => openAdd(date, defaultMeal())}><i>📷</i>记一餐</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}><i>📈</i>统计</button>
        <button className={tab === "me" ? "on" : ""} onClick={() => setTab("me")}><i>⚙️</i>我的</button>
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PinGate({ onOk }: { onOk: () => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState(false);
  const go = async () => {
    localStorage.setItem("fitlog_pin", v.trim());
    try {
      const res = await fetch("/api/profile", { headers: { "x-pin": v.trim() } });
      if (res.ok) onOk();
      else { localStorage.removeItem("fitlog_pin"); setErr(true); }
    } catch { setErr(true); }
  };
  return (
    <div className="page">
      <section className="card pin-card">
        <h2>🔒 访问口令</h2>
        <input type="password" inputMode="numeric" placeholder="输入访问口令" value={v}
          onChange={(e) => { setV(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && go()} />
        {err && <p className="pin-err">口令不正确，请重试</p>}
        <button className="primary" onClick={go}>进入</button>
      </section>
    </div>
  );
}
