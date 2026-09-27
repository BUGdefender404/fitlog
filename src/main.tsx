import React from "react";
import { createRoot } from "react-dom/client";
import { detectStore } from "./api";
import App from "./App";
import "./App.css";

(async () => {
  const { store, needPin } = await detectStore();
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App store={store} needPin={needPin} />
    </React.StrictMode>
  );
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
