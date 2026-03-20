"use client";
// src/app/components/DashboardClient/DashboardClient.tsx

import { useState, useEffect, useCallback } from "react";
import { Drum } from "lucide-react";
import HomeTab from "./HomeTab";
import UsageTab from "./UsageTab";
import PluginsTab from "./PluginsTab";
import SettingsTab from "./SettingsTab";
import type { ResolvedRecordingPlugin, ResolvedTranscriptionPlugin } from "@/lib/plugins/resolver";
import type { SessionEntry } from "./SessionList";
import RoomNudge from "./RoomNudge";
import { createRoomClient } from "@/lib/qlave/createRoomClient";

type Tab = "home" | "usage" | "plugins" | "billing" | "settings" | "profile";
type Theme = "dark" | "light" | "system";
type Tier = "free" | "pro" | "creator" | "founder";

// SessionLog is now SessionEntry (includes hasTranscript, hasSummary, roomCode)
export type SessionLog = SessionEntry;

export interface MonthlyStats {
  sessionCount: number;
  totalMessages: number;
  totalDurationMs: number;
  peakPeers: number;
}

interface Props {
  user: { id: string; name: string | null; email: string | null };
  site: { id: string; siteKey: string } | null;
  orgId: string | null;
  recentSessions: SessionEntry[];
  monthly: MonthlyStats;
  transcriptionPlugin?: ResolvedTranscriptionPlugin | null;
  loadError?: string | null;
  recordingPlugin?: ResolvedRecordingPlugin | null;
  maxPeers: number;
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

function getTier(plugin: ResolvedTranscriptionPlugin | null | undefined): Tier {
  if (!plugin || !plugin.enabled) return "free";
  return (plugin.tier as Tier) ?? "free";
}

const TIER_COLOR: Record<Tier, string> = {
  free:    "var(--text-3)",
  pro:     "var(--purple-l)",
  creator: "#d4924e",
  founder: "var(--green)",
};

const TIER_BG: Record<Tier, string> = {
  free:    "rgba(255,255,255,0.04)",
  pro:     "rgba(124,58,237,0.12)",
  creator: "rgba(194,119,58,0.12)",
  founder: "rgba(34,197,94,0.1)",
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; transition: var(--transition-override, background 0.2s, color 0.2s); }
  a { text-decoration: none; color: inherit; }
  button { font-family: inherit; cursor: pointer; border: none; }
  input, select, textarea { font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: none; }

  :root, [data-theme="dark"] {
    --purple:      #7c3aed;
    --purple-l:    #a78bfa;
    --purple-d:    #4c1d95;
    --purple-g:    rgba(124,58,237,0.28);
    --purple-g2:   rgba(124,58,237,0.08);
    --bg:          #080810;
    --bg-2:        #0d0d1a;
    --bg-3:        #111120;
    --surface:     #161428;
    --border:      rgba(255,255,255,0.06);
    --border-p:    rgba(124,58,237,0.25);
    --text:        #ece8f8;
    --text-2:      #918caa;
    --text-3:      #4a4660;
    --green:       #22c55e;
    --green-g:     rgba(34,197,94,0.2);
    --red:         #f87171;
    --amber:       #fbbf24;
    --serif:       'Instrument Serif', Georgia, serif;
    --mono:        'DM Mono', monospace;
    --sidebar-w:   220px;
  }

  [data-theme="light"] {
    --bg:          #faf9fc;
    --bg-2:        #f3f0f9;
    --bg-3:        #ede9f6;
    --surface:     #e8e3f4;
    --border:      rgba(0,0,0,0.08);
    --border-p:    rgba(124,58,237,0.3);
    --text:        #1a1528;
    --text-2:      #5a5070;
    --text-3:      #9890b0;
    --purple-g:    rgba(124,58,237,0.15);
    --purple-g2:   rgba(124,58,237,0.06);
  }

  .dash { display: flex; min-height: 100vh; background: var(--bg); color: var(--text); }

  .sidebar {
    width: var(--sidebar-w); flex-shrink: 0;
    background: var(--bg-2); border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
    overflow-y: auto; padding: 20px 12px;
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 10px 20px; border-bottom: 1px solid var(--border);
    margin-bottom: 16px; cursor: pointer;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 100px;
    background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
    font-size: 13px; font-weight: 600; color: #fff;
    box-shadow: 0 2px 12px var(--purple-g); font-family: var(--serif);
  }
  .sidebar-section {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-3);
    padding: 0 10px; margin: 14px 0 6px;
  }
  .sidebar-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 8px;
    font-size: 14px; color: var(--text-2);
    cursor: pointer; transition: all 0.15s; margin-bottom: 2px; user-select: none;
  }
  .sidebar-item:hover { background: var(--border); color: var(--text); }
  .sidebar-item.active { background: var(--purple-g2); color: var(--purple-l); }
  .sidebar-item.active .s-icon { color: var(--purple-l); }
  .s-icon { font-size: 15px; width: 20px; text-align: center; flex-shrink: 0; color: var(--text-3); transition: color 0.15s; }
  .sidebar-bottom { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }

  /* Tier badge in sidebar */
  .sidebar-tier {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 10px; border-radius: 8px; margin-bottom: 8px;
    background: var(--bg-3); border: 1px solid var(--border); cursor: pointer;
    transition: border-color 0.15s;
  }
  .sidebar-tier:hover { border-color: var(--border-p); }
  .sidebar-tier-left { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); }
  .tier-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .sidebar-tier-badge {
    font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 2px 8px; border-radius: 100px;
  }
  .sidebar-upgrade-hint {
    font-size: 11px; color: var(--purple-l); font-family: var(--mono);
    letter-spacing: 0.06em; padding: 0 10px; margin-bottom: 10px;
    display: flex; align-items: center; gap: 6px;
  }

  .theme-toggle {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 10px; border-radius: 8px;
    font-size: 13px; color: var(--text-2); cursor: pointer; transition: all 0.15s; user-select: none;
  }
  .theme-toggle:hover { background: var(--border); color: var(--text); }
  .theme-chips { display: flex; gap: 4px; margin-left: auto; }
  .theme-chip {
    padding: 2px 8px; border-radius: 100px; font-size: 11px;
    background: var(--bg-3); color: var(--text-3);
    cursor: pointer; transition: all 0.15s; border: 1px solid transparent; font-family: var(--mono);
  }
  .theme-chip.active { background: var(--purple-g2); color: var(--purple-l); border-color: var(--border-p); }

  .mobile-header {
    display: none; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: var(--bg-2); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
  }
  .hamburger { display: flex; flex-direction: column; gap: 5px; padding: 6px; cursor: pointer; }
  .hamburger span { width: 20px; height: 2px; background: var(--text-2); border-radius: 2px; transition: all 0.2s; display: block; }
  .mobile-menu { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
  .mobile-menu-panel {
    position: absolute; left: 0; top: 0; bottom: 0; width: 260px;
    background: var(--bg-2); border-right: 1px solid var(--border);
    padding: 20px 12px; display: flex; flex-direction: column; overflow-y: auto;
    animation: slideIn 0.2s ease;
  }
  @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }

  .main { flex: 1; overflow-y: auto; min-width: 0; }
  .main-header { padding: 28px 36px 24px; border-bottom: 1px solid var(--border); }
  .main-eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-3); margin-bottom: 6px; }
  .main-title { font-family: var(--serif); font-size: 28px; color: var(--text); margin-bottom: 4px; }
  .main-sub { font-size: 14px; color: var(--text-2); }
  .main-body { padding: 32px 36px 60px; }

  .card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 20px; }
  .card-header {
    padding: 16px 22px; border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 600; color: var(--text);
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-header-sub { font-size: 12px; color: var(--text-3); font-weight: 400; font-family: var(--mono); }
  .card-body { padding: 22px; }

  .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 20px 22px; transition: border-color 0.2s; }
  .stat-card:hover { border-color: var(--border-p); }
  .stat-label { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin-bottom: 10px; }
  .stat-value { font-family: var(--serif); font-size: 34px; color: var(--text); line-height: 1; margin-bottom: 4px; }
  .stat-sub { font-size: 12px; color: var(--text-3); }
  .live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); margin-right: 5px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }

  .row { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px; border-bottom: 1px solid var(--border); }
  .row:last-child { border-bottom: none; }
  .row-label { font-size: 14px; color: var(--text); }
  .row-sub { font-size: 12px; color: var(--text-3); margin-top: 2px; }
  .row-value { font-size: 13px; color: var(--text-2); font-family: var(--mono); }

  .script-box { background: var(--bg-3); border: 1px solid var(--border-p); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 0 40px var(--purple-g2); }
  .script-box-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .script-box-sub { font-size: 13px; color: var(--text-2); margin-bottom: 16px; }
  .code-block {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px;
    font-family: var(--mono); font-size: 12px; color: #a6e3a1;
    position: relative; cursor: pointer; transition: border-color 0.15s; white-space: pre-wrap; word-break: break-all;
  }
  .code-block:hover { border-color: var(--border-p); }
  .copy-hint { position: absolute; top: 10px; right: 12px; font-size: 10px; color: var(--text-3); font-family: 'DM Sans', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }

  .room-row { display: flex; align-items: center; gap: 14px; padding: 14px 22px; border-bottom: 1px solid var(--border); transition: background 0.15s; }
  .room-row:last-child { border-bottom: none; }
  .room-row:hover { background: var(--bg-3); }
  .room-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .room-dot.live { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse 2s infinite; }
  .room-dot.idle { background: var(--text-3); }
  .room-name { font-size: 14px; color: var(--text); font-weight: 500; flex: 1; }
  .room-meta { font-size: 12px; color: var(--text-3); font-family: var(--mono); }
  .room-badge { padding: 2px 8px; border-radius: 100px; font-size: 11px; font-family: var(--mono); }
  .room-badge.live { background: var(--green-g); color: var(--green); }
  .room-badge.idle { background: var(--bg-3); color: var(--text-3); }

  .usage-row { margin-bottom: 20px; }
  .usage-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .usage-label { font-size: 14px; color: var(--text); }
  .usage-value { font-size: 13px; color: var(--text-2); font-family: var(--mono); }
  .usage-bar { height: 6px; background: var(--bg-3); border-radius: 100px; overflow: hidden; }
  .usage-fill { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--purple-d), var(--purple-l)); transition: width 0.6s ease; }

  .plan-card {
    background: var(--bg-2); border: 1px solid var(--border-p); border-radius: 14px; padding: 28px;
    margin-bottom: 20px; box-shadow: 0 0 40px var(--purple-g2);
    display: flex; align-items: center; justify-content: space-between;
  }
  .plan-name { font-family: var(--serif); font-size: 26px; color: var(--text); margin-bottom: 4px; }
  .plan-desc { font-size: 13px; color: var(--text-2); }
  .plan-price { font-family: var(--serif); font-size: 40px; color: var(--text); text-align: right; }
  .plan-price-sub { font-size: 13px; color: var(--text-3); font-family: 'DM Sans', sans-serif; text-align: right; }

  /* Upgrade banner */
  .upgrade-banner {
    border-radius: 12px; padding: 20px 24px; margin-bottom: 20px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }
  .upgrade-banner.to-pro { background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.2); }
  .upgrade-banner.to-creator { background: rgba(194,119,58,0.08); border: 1px solid rgba(194,119,58,0.2); }
  .upgrade-banner-text { font-size: 13px; color: var(--text-2); line-height: 1.6; }
  .upgrade-banner-text strong { color: var(--text); font-weight: 600; display: block; margin-bottom: 2px; }
  .upgrade-banner-cta {
    padding: 9px 20px; border-radius: 8px; font-size: 12px; font-weight: 700;
    font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase;
    white-space: nowrap; cursor: pointer; border: none; transition: all 0.15s; flex-shrink: 0;
  }
  .upgrade-banner.to-pro .upgrade-banner-cta { background: var(--purple); color: #fff; box-shadow: 0 2px 16px var(--purple-g); }
  .upgrade-banner.to-pro .upgrade-banner-cta:hover { background: #6d28d9; transform: translateY(-1px); }
  .upgrade-banner.to-creator .upgrade-banner-cta { background: linear-gradient(135deg,#c2773a,#d4924e); color: #fff; }
  .upgrade-banner.to-creator .upgrade-banner-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }

  .field { margin-bottom: 18px; }
  .field-label { display: block; font-size: 11px; font-weight: 500; color: var(--text-2); margin-bottom: 7px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono); }
  .field-input { width: 100%; padding: 11px 14px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 9px; color: var(--text); font-size: 14px; transition: border-color 0.15s, box-shadow 0.15s; }
  .field-input:focus { border-color: var(--border-p); box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
  .field-input::placeholder { color: var(--text-3); }

  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 9px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: var(--purple); color: #fff; box-shadow: 0 2px 16px var(--purple-g); }
  .btn-primary:hover { background: #6d28d9; transform: translateY(-1px); }
  .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border-p); }
  .btn-outline:hover { background: var(--purple-g2); }
  .btn-danger { background: rgba(248,113,113,0.08); color: var(--red); border: 1px solid rgba(248,113,113,0.2); }
  .btn-danger:hover { background: rgba(248,113,113,0.15); }
  .btn-sm { padding: 6px 14px; font-size: 12px; }

  .key-box {
    background: var(--bg-3); border: 1px solid var(--border-p); border-radius: 8px; padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: var(--mono); font-size: 13px; color: var(--purple-l);
    margin-bottom: 16px; box-shadow: 0 0 20px var(--purple-g2);
  }

  .danger-card { border-color: rgba(248,113,113,0.2) !important; }
  .danger-card .card-header { color: var(--red); border-bottom-color: rgba(248,113,113,0.15); }

  .avatar {
    width: 64px; height: 64px; border-radius: 50%;
    background: linear-gradient(135deg, var(--purple-d), var(--purple));
    display: flex; align-items: center; justify-content: center;
    font-family: var(--serif); font-size: 26px; color: #fff; flex-shrink: 0;
  }
  .profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 28px; }
  .profile-name { font-family: var(--serif); font-size: 24px; color: var(--text); }
  .profile-email { font-size: 14px; color: var(--text-2); font-family: var(--mono); margin-top: 2px; }

  @media (max-width: 768px) {
    .sidebar { display: none; }
    .mobile-header { display: flex; }
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .main-header { padding: 20px; }
    .main-body { padding: 20px 20px 60px; }
    .plan-card { flex-direction: column; align-items: flex-start; gap: 16px; }
  }
  @media (max-width: 480px) { .stat-grid { grid-template-columns: 1fr; } }
`;

// ── Upgrade banner component ──────────────────────────────────────────────────

function UpgradeBanner({ tier }: { tier: Tier }) {
  if (tier === "free") return (
    <div className="upgrade-banner to-pro">
      <div className="upgrade-banner-text">
        <strong>You're on Free</strong>
        Your transcripts disappear when the session ends. Upgrade to Pro and keep everything — $8/mo, locked in forever.
      </div>
      <a href="/pricing"><button className="upgrade-banner-cta">Upgrade to Pro →</button></a>
    </div>
  );
  if (tier === "pro") return (
    <div className="upgrade-banner to-creator">
      <div className="upgrade-banner-text">
        <strong>Running longer sessions?</strong>
        Creator gives you 5× more minutes, a higher accuracy model, and priority queue.
      </div>
      <a href="/pricing"><button className="upgrade-banner-cta">See Creator →</button></a>
    </div>
  );
  return null;
}

// ── Billing tab ───────────────────────────────────────────────────────────────

const PLAN_COPY: Record<Tier, { name: string; desc: string; price: string; priceSub: string }> = {
  free:    { name: "Hobby — Free",   desc: "Live captions only. Transcripts not saved.",                           price: "$0",  priceSub: "forever" },
  pro:     { name: "Pro",            desc: "Full transcripts + AI summaries. $8/mo locked in forever.",           price: "$8",  priceSub: "/ month" },
  creator: { name: "Creator",        desc: "3,000 min/mo, Nova model, priority queue.",                           price: "$20", priceSub: "/ month" },
  founder: { name: "Founder",        desc: "Unlimited access. You're part of the inner circle.",                  price: "$0",  priceSub: "forever" },
};

const PLAN_FEATURES: Record<Tier, { label: string; sub: string }[]> = {
  free: [
    { label: "Unlimited P2P video calls",    sub: "No session limits" },
    { label: "5 min/day live captions",       sub: "Captions disappear after the session" },
    { label: "Transcripts not saved",         sub: "Upgrade to Pro to keep everything" },
  ],
  pro: [
    { label: "600 transcription min/month",  sub: "~10 hours of audio" },
    { label: "Full transcript saved",         sub: "Every session, automatically" },
    { label: "AI session summary",            sub: "Key moments and action items" },
    { label: "Session history",               sub: "Complete searchable archive" },
  ],
  creator: [
    { label: "3,000 transcription min/month", sub: "~50 hours of audio" },
    { label: "Nova accuracy model",           sub: "Higher fidelity transcription" },
    { label: "Priority queue",                sub: "Faster processing" },
    { label: "Everything in Pro",             sub: "All Pro features included" },
  ],
  founder: [
    { label: "Unlimited transcription",       sub: "No cap, ever" },
    { label: "All features",                  sub: "Full access forever" },
    { label: "Inner circle access",           sub: "Direct line to the team" },
  ],
};

function BillingTab({ tier }: { tier: Tier }) {
  const plan = PLAN_COPY[tier];
  const features = PLAN_FEATURES[tier];

  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Billing</div>
        <h1 className="main-title">Plan & billing</h1>
        <p className="main-sub">Your current plan and what's included</p>
      </div>
      <div className="main-body">

        <UpgradeBanner tier={tier} />

        <div className="plan-card" style={{ borderColor: tier === "founder" ? "rgba(34,197,94,0.25)" : undefined }}>
          <div>
            <div className="plan-name">{plan.name}</div>
            <div className="plan-desc">{plan.desc}</div>
          </div>
          <div>
            <div className="plan-price">{plan.price}</div>
            <div className="plan-price-sub">{plan.priceSub}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">What's included</div>
          {features.map(r => (
            <div className="row" key={r.label}>
              <div><div className="row-label">{r.label}</div><div className="row-sub">{r.sub}</div></div>
              <div className="row-value" style={{ color: "var(--green)" }}>✓</div>
            </div>
          ))}
        </div>

        {(tier === "pro" || tier === "creator") && (
          <div className="card">
            <div className="card-header">Subscription</div>
            <div className="row">
              <div><div className="row-label">Status</div><div className="row-sub">Active</div></div>
              <div className="row-value" style={{ color: "var(--green)" }}>Active</div>
            </div>
            <div className="row">
              <div><div className="row-label">Cancel</div><div className="row-sub">Access continues until end of billing period</div></div>
              <button className="btn btn-danger btn-sm">Cancel plan</button>
            </div>
          </div>
        )}

        {tier === "free" && (
          <div className="card">
            <div className="card-header">Invoices</div>
            <div className="row" style={{ justifyContent: "center", padding: "32px" }}>
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>No invoices yet — you're on the free plan</span>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ── Profile tab (unchanged) ───────────────────────────────────────────────────

function ProfileTab({ user }: { user: Props["user"] }) {
  const initials = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();
  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Profile</div>
        <h1 className="main-title">Your profile</h1>
        <p className="main-sub">How you appear to other qlave users</p>
      </div>
      <div className="main-body">
        <div className="card" style={{ opacity: 0.5 }}>
          <div className="card-body">
            <div className="profile-header">
              <div className="avatar">{initials}</div>
              <div>
                <div className="profile-name">{user.name ?? "No name set"}</div>
                <div className="profile-email">{user.email}</div>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Display name <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>— coming soon</span></label>
              <input className="field-input" defaultValue={user.name ?? ""} placeholder="Aragorn" disabled />
            </div>
            <div className="field">
              <label className="field-label">Email <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>— coming soon</span></label>
              <input className="field-input" defaultValue={user.email ?? ""} type="email" disabled />
            </div>
            <div className="field">
              <label className="field-label">Bio <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400 }}>— coming soon</span></label>
              <input className="field-input" placeholder="Commander enjoyer, MTG grinder..." disabled />
            </div>
            <button className="btn btn-primary" disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>Save changes</button>
          </div>
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          <div className="card-header">Appearance<span className="card-header-sub">coming soon</span></div>
          <div className="row">
            <div><div className="row-label">Avatar</div><div className="row-sub">Custom image coming soon</div></div>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 16 }}>{initials}</div>
          </div>
          <div className="row">
            <div><div className="row-label">Pronouns</div><div className="row-sub">Shown in video rooms</div></div>
            <input className="field-input" placeholder="they/them" style={{ width: 140 }} disabled />
          </div>
        </div>
        <div className="card" style={{ opacity: 0.5 }}>
          <div className="card-header">Password<span className="card-header-sub">coming soon</span></div>
          <div className="card-body">
            <div className="field">
              <label className="field-label">Current password</label>
              <input className="field-input" type="password" placeholder="••••••••" disabled />
            </div>
            <div className="field">
              <label className="field-label">New password</label>
              <input className="field-input" type="password" placeholder="••••••••" disabled />
            </div>
            <button className="btn btn-outline" disabled style={{ opacity: 0.4, cursor: "not-allowed" }}>Update password</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: "home",     icon: "▦", label: "Home" },
  { id: "usage",    icon: "◈", label: "Usage" },
  { id: "plugins",  icon: "⊞", label: "Plugins" },
  { id: "billing",  icon: "◎", label: "Billing" },
  { id: "settings", icon: "⊙", label: "Settings" },
  { id: "profile",  icon: "◯", label: "Profile" },
];

function SidebarNav({ active, onSelect, theme, onTheme, onClose, tier }: {
  active: Tab;
  onSelect: (t: Tab) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onClose?: () => void;
  tier: Tier;
}) {
  return (
    <>
      <div className="sidebar-logo" onClick={() => { window.location.href = "/"; }}>
        <span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span>
      </div>

      {/* Tier badge */}
      <a href="/pricing" style={{ textDecoration: "none" }}>
        <div className="sidebar-tier">
          <div className="sidebar-tier-left">
            <div className="tier-dot" style={{ background: TIER_COLOR[tier], boxShadow: tier !== "free" ? `0 0 6px ${TIER_COLOR[tier]}` : "none" }} />
            <span>Plan</span>
          </div>
          <span className="sidebar-tier-badge" style={{ background: TIER_BG[tier], color: TIER_COLOR[tier] }}>
            {tier}
          </span>
        </div>
      </a>
      {(tier === "free" || tier === "pro") && (
        <a href="/pricing" style={{ textDecoration: "none" }}>
          <div className="sidebar-upgrade-hint">
            ↑ {tier === "free" ? "Upgrade to Pro" : "Upgrade to Creator"}
          </div>
        </a>
      )}

      <div className="sidebar-section">Main</div>
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`sidebar-item ${active === item.id ? "active" : ""}`}
          onClick={() => { onSelect(item.id); onClose?.(); }}
        >
          <span className="s-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}
      <div className="sidebar-bottom">
        <div className="theme-toggle">
          <span className="s-icon">◑</span>
          Theme
          <div className="theme-chips">
            {(["dark", "light", "system"] as Theme[]).map(t => (
              <span
                key={t}
                className={`theme-chip ${theme === t ? "active" : ""}`}
                onClick={(e) => { e.stopPropagation(); onTheme(t); }}
              >
                {t === "dark" ? "D" : t === "light" ? "L" : "S"}
              </span>
            ))}
          </div>
        </div>
        <div className="sidebar-item" onClick={() => { window.location.href = "/user/logout"; }}>
          <span className="s-icon">→</span>
          Sign out
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardClient({ user, site, orgId, recentSessions, monthly, transcriptionPlugin, loadError, recordingPlugin, maxPeers }: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [theme, setTheme] = useState<Theme>("system");
  const [menuOpen, setMenuOpen] = useState(false);

  const tier = getTier(transcriptionPlugin);
  const [nudgeGenerating, setNudgeGenerating] = useState(false);
  const [activeRoomUrl, setActiveRoomUrl]     = useState<string | null>(null);

  const handleThemeChange = useCallback(async (t: Theme) => {
    setTheme(t);
    localStorage.setItem("qlave-theme", t);
    await fetch(`/__user-session?userId=${user.id}&action=settings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ theme: t }),
    }).catch(() => {});
  }, [user.id]);


  // Load theme from DO on mount
  useEffect(() => {
    fetch(`/__user-session?userId=${user.id}&action=settings`)
      .then(r => r.json())
      .then((data: any) => {
        const t = data.settings?.theme as Theme | undefined;
        if (t) {
          setTheme(t);
          localStorage.setItem("qlave-theme", t);
        }
      })
      .catch(() => {});
  }, [user.id]);

  // Apply theme to DOM
  useEffect(() => {
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.setAttribute("data-theme", resolved);
  }, [theme]);

  async function handleNudgeStart() {
    setNudgeGenerating(true);
    try {
      const url = await createRoomClient();
      if (url) {
        setActiveRoomUrl(url);
        setTab("home");
      }
    } finally {
      setNudgeGenerating(false);
    }
  }

  const tabContent: Record<Tab, React.ReactNode> = {
    home:     <HomeTab
                user={user}
                site={site}
                orgId={orgId}
                recentSessions={recentSessions}
                monthly={monthly}
                activeRoomUrl={activeRoomUrl}
                onRoomCreated={setActiveRoomUrl}
                transcription={transcriptionPlugin ?? null}
                recording={recordingPlugin ?? null}
                maxPeers={maxPeers}
              />,
    usage:    <UsageTab monthly={monthly} transcription={transcriptionPlugin ?? null} recording={recordingPlugin ?? null} />,
    plugins:  <PluginsTab transcription={transcriptionPlugin ?? null} recording={recordingPlugin ?? null} />,
    billing:  <BillingTab tier={tier} />,
    settings: <SettingsTab user={user} site={site} />,
    profile:  <ProfileTab user={user} />,
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="dash">
        <aside className="sidebar">
          <SidebarNav active={tab} onSelect={setTab} theme={theme} onTheme={handleThemeChange} tier={tier} />
        </aside>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div className="mobile-header">
            <div className="hamburger" onClick={() => setMenuOpen(true)}>
              <span /><span /><span />
            </div>
            <span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span>
            <div style={{ width: 32 }} />
          </div>
          {menuOpen && (
            <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
              <div className="mobile-menu-panel" onClick={e => e.stopPropagation()}>
                <SidebarNav active={tab} onSelect={setTab} theme={theme} onTheme={handleThemeChange} onClose={() => setMenuOpen(false)} tier={tier} />
              </div>
            </div>
          )}
          <main className="main">
            {loadError && (
              <div style={{
                margin: "20px 36px 0",
                padding: "14px 18px",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--red)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                ⚠ {loadError}
              </div>
            )}
            {tabContent[tab]}
          </main>
        </div>
      </div>
      <RoomNudge
        onStartRoom={handleNudgeStart}
        generating={nudgeGenerating}
        roomUrl={activeRoomUrl}
      />
    </>
  );
}