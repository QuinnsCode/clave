// src/widget/styles.ts
export const STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host { all: initial; }

  /* ── Pill button ─────────────────────────────────────────────── */
  .q-pill {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 40px;
    border-radius: 100px;
    border: none;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    overflow: hidden;
    white-space: nowrap;

    background: linear-gradient(
      105deg,
      #3b1a6e 0%,
      #6d28d9 35%,
      #7c3aed 50%,
      #c2692a 68%,
      #6d28d9 82%,
      #4c1d95 100%
    );
    background-size: 250% 100%;
    animation: q-shimmer 4s ease-in-out infinite;

    box-shadow:
      0 2px 16px rgba(124,58,237,0.45),
      0 1px 4px rgba(0,0,0,0.4),
      inset 0 1px 0 rgba(255,255,255,0.08);

    transition:
      width 0.3s cubic-bezier(0.4,0,0.2,1),
      padding 0.3s cubic-bezier(0.4,0,0.2,1),
      box-shadow 0.2s,
      transform 0.15s;
  }

  @keyframes q-shimmer {
    0%   { background-position: 100% 0; }
    50%  { background-position:   0% 0; }
    100% { background-position: 100% 0; }
  }

  .q-pill.idle {
    width: 40px;
    padding: 0;
    justify-content: center;
  }

  .q-pill.expanded {
    width: 130px;
    padding: 0 16px;
    justify-content: flex-start;
  }

  .q-pill:hover {
    box-shadow:
      0 4px 24px rgba(124,58,237,0.6),
      0 1px 6px rgba(194,105,42,0.25),
      inset 0 1px 0 rgba(255,255,255,0.12);
    transform: translateY(-1px);
  }
  .q-pill:active { transform: scale(0.97) translateY(0); }
  .q-pill.dragging { transition: none; cursor: grabbing; transform: scale(1.04); }

  .q-pill-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
    color: rgba(255,255,255,0.92);
  }

  .q-pill-label {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.92);
    letter-spacing: 0.02em;
    opacity: 0;
    width: 0;
    overflow: hidden;
    transition: opacity 0.2s 0.05s, width 0.3s cubic-bezier(0.4,0,0.2,1);
    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  }
  .q-pill.expanded .q-pill-label {
    opacity: 1;
    width: auto;
  }

  /* ── Panel ───────────────────────────────────────────────────── */
  .q-panel {
    position: fixed;
    z-index: 2147483646;
    width: 320px;
    background: #0d0d1a;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(124,58,237,0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform-origin: bottom center;
    transition: opacity 0.2s, transform 0.2s;
  }
  .q-panel.hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px) scale(0.97);
  }
  .q-panel.visible {
    opacity: 1;
    pointer-events: all;
    transform: translateY(0) scale(1);
  }

  .q-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: #111120;
  }
  .q-panel-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #ece8f8;
  }
  .q-close {
    background: none;
    border: none;
    color: #918caa;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 3px 5px;
    border-radius: 4px;
    transition: color 0.1s, background 0.1s;
  }
  .q-close:hover { color: #ece8f8; background: rgba(255,255,255,0.06); }

  .q-panel-body {
    flex: 1;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #918caa;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    text-align: center;
    min-height: 160px;
  }
  .q-panel-body .q-logo { width: 28px; height: 28px; margin-bottom: 4px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.7); }
  .q-panel-body .q-logo svg { width: 28px; height: 28px; }
  .q-panel-body p { line-height: 1.6; }

  .q-signin-btn {
    margin-top: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #5b21b6, #7c3aed);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    box-shadow: 0 2px 12px rgba(124,58,237,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .q-signin-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 18px rgba(124,58,237,0.55);
  }
`;