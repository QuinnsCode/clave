// src/widget/index.ts
declare const __WIDGET_VERSION__: string;

import { mountPill, type Position } from "./pill";

(function () {
  if ((window as unknown as Record<string, unknown>).__qlave_loaded__) {
    console.warn("[Qlave] Already loaded — skipping.");
    return;
  }
  (window as unknown as Record<string, unknown>).__qlave_loaded__ = true;

  const script = document.currentScript as HTMLScriptElement | null;
  const siteKey  = script?.getAttribute("data-site") ?? null;
  const position = (script?.getAttribute("data-position") ?? "bottom-right") as Position;
  const padding  = parseInt(script?.getAttribute("data-padding") ?? "16", 10);

  if (!siteKey) {
    console.warn("[Qlave] Missing data-site on script tag. Widget will not mount.");
    return;
  }

  console.log(`[Qlave] v${__WIDGET_VERSION__} — site: ${siteKey}`);

  const boot = () => mountPill({ siteKey, position, padding });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();