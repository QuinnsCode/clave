// src/widget/pill.ts
import { STYLES } from "./styles";
import { RADIO_ICON, MIC_ICON } from "./icons";
import { checkSession, openSignIn, type QlaveUser } from "./auth";

export type Position = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface PillConfig {
  siteKey: string;
  position: Position;
  padding: number;
}

const STORAGE_KEY = "qlave_pill_pos";
const PILL_W = 40;
const PILL_H = 40;

export function mountPill(config: PillConfig): void {
  const { position, padding } = config;

  // ── Shadow host ──────────────────────────────────────────────
  const host = document.createElement("div");
  host.setAttribute("id", "qlave-widget");
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  // ── Pill ─────────────────────────────────────────────────────
  const pill = document.createElement("button");
  pill.className = "q-pill idle";
  pill.setAttribute("aria-label", "Open Qlave");
  pill.style.pointerEvents = "auto";
  pill.innerHTML = `<span class="q-pill-icon">${RADIO_ICON}</span><span class="q-pill-label">qlave</span>`;
  shadow.appendChild(pill);

  // ── Panel ────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.className = "q-panel hidden";
  panel.style.pointerEvents = "auto";
  shadow.appendChild(panel);

  function renderPanel(user: QlaveUser | null, loading: boolean): void {
    panel.innerHTML = `
      <div class="q-panel-header">
        <div class="q-panel-title">${RADIO_ICON} qlave</div>
        <button class="q-close" aria-label="Close">✕</button>
      </div>
      <div class="q-panel-body">
        ${loading ? `
          <div class="q-logo">${RADIO_ICON}</div>
          <p>Loading…</p>
        ` : user ? `
          <div class="q-logo">${MIC_ICON}</div>
          <p>Signed in as<br/><strong style="color:#ece8f8">${user.email}</strong></p>
          <p style="margin-top:8px;color:#4a4660;font-size:12px">Room UI coming in Phase 4.</p>
        ` : `
          <div class="q-logo">${RADIO_ICON}</div>
          <p>Sign in to start or join<br/>a video room on any site.</p>
          <button class="q-signin-btn">Sign in to qlave</button>
        `}
      </div>
    `;

    (panel.querySelector(".q-close") as HTMLButtonElement)
      .addEventListener("click", () => togglePanel());

    const signinBtn = panel.querySelector(".q-signin-btn") as HTMLButtonElement | null;
    signinBtn?.addEventListener("click", () => openSignIn());
  }

  // ── Position ─────────────────────────────────────────────────
  function defaultPos(): { x: number; y: number } {
    const vw = window.innerWidth, vh = window.innerHeight;
    switch (position) {
      case "bottom-right": return { x: vw - PILL_W - padding, y: vh - PILL_H - padding };
      case "bottom-left":  return { x: padding,               y: vh - PILL_H - padding };
      case "top-right":    return { x: vw - PILL_W - padding, y: padding };
      case "top-left":     return { x: padding,               y: padding };
    }
  }

  function loadPos(): { x: number; y: number } {
    try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r) as {x:number;y:number}; } catch { /**/ }
    return defaultPos();
  }

  function savePos(x: number, y: number): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })); } catch { /**/ }
  }

  function clamp(x: number, y: number) {
    return {
      x: Math.max(padding, Math.min(x, window.innerWidth  - PILL_W - padding)),
      y: Math.max(padding, Math.min(y, window.innerHeight - PILL_H - padding)),
    };
  }

  function repositionPanel(px: number, py: number): void {
    const panelW = 320, panelH = panel.offsetHeight || 240;
    const vw = window.innerWidth;
    let top = py - panelH - 10;
    if (top < padding) top = py + PILL_H + 10;
    let left = px;
    if (px > vw / 2) left = px + PILL_W - panelW;
    left = Math.max(padding, Math.min(left, vw - panelW - padding));
    panel.style.left = `${left}px`;
    panel.style.top  = `${top}px`;
  }

  function applyPos(x: number, y: number): void {
    const c = clamp(x, y);
    pill.style.left = `${c.x}px`;
    pill.style.top  = `${c.y}px`;
    repositionPanel(c.x, c.y);
  }

  let { x, y } = loadPos();
  applyPos(x, y);
  window.addEventListener("resize", () => { const p = loadPos(); applyPos(p.x, p.y); });

  // ── Hover expand/collapse ────────────────────────────────────
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  pill.addEventListener("mouseenter", () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    pill.classList.remove("idle"); pill.classList.add("expanded");
  });
  pill.addEventListener("mouseleave", () => {
    hoverTimer = setTimeout(() => {
      pill.classList.remove("expanded"); pill.classList.add("idle");
    }, 800);
  });

  // ── Drag ─────────────────────────────────────────────────────
  let dragging = false, dragOffX = 0, dragOffY = 0, moved = false;

  pill.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false;
    dragOffX = e.clientX - x; dragOffY = e.clientY - y;
    pill.classList.add("dragging");
    pill.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  pill.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    moved = true; x = e.clientX - dragOffX; y = e.clientY - dragOffY;
    applyPos(x, y);
  });
  pill.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false; pill.classList.remove("dragging");
    if (moved) { const c = clamp(x, y); x = c.x; y = c.y; savePos(x, y); }
    else togglePanel();
  });

  // ── Panel toggle + auth ──────────────────────────────────────
  let panelOpen = false;
  let currentUser: QlaveUser | null = null;

  function togglePanel(): void {
    panelOpen = !panelOpen;
    panel.classList.toggle("hidden",  !panelOpen);
    panel.classList.toggle("visible",  panelOpen);
    pill.setAttribute("aria-expanded", String(panelOpen));
    if (panelOpen) repositionPanel(x, y);
  }

  // Render loading state initially, then resolve auth
  renderPanel(null, true);

  void checkSession().then((user) => {
    currentUser = user;
    renderPanel(currentUser, false);
  });
}