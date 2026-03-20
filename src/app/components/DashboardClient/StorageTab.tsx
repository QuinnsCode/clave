"use client";
// src/app/components/DashboardClient/StorageTab.tsx

import type { ResolvedRecordingPlugin } from "@/lib/plugins/resolver";

interface Props {
  recording: ResolvedRecordingPlugin | null;
}

const TIER_FEATURES = {
  none: {
    resolution: "—",
    maxHoursPerMonth: 0,
    retentionDays: 0,
  },
  "720p": {
    resolution: "720p HD",
    maxHoursPerMonth: 5,
    retentionDays: 30,
  },
  "1080p": {
    resolution: "1080p Full HD",
    maxHoursPerMonth: 50,
    retentionDays: 90,
  },
};

const UPGRADE_TIERS = [
  { res: "720p", label: "Starter Recording", price: "$3/mo", hours: 5, retention: "30 days", color: "var(--purple-l)" },
  { res: "1080p", label: "Creator Recording", price: "$20/mo", hours: 50, retention: "90 days", color: "#d4924e" },
];

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 90 ? "var(--red)" : pct > 70 ? "var(--amber)" : "linear-gradient(90deg, var(--purple-d), var(--purple-l))";
  return (
    <div className="usage-bar">
      <div className="usage-fill" style={{ width: limit > 0 ? `${pct}%` : "4px", background: color }} />
    </div>
  );
}

export default function StorageTab({ recording }: Props) {
  const enabled = recording?.enabled ?? false;
  const resolution = recording?.resolution ?? "720p";
  const maxHours = recording?.maxHoursPerMonth ?? 0;
  const hoursUsed = recording?.hoursUsed ?? 0; // always 0 until KV tracking lands
  const retentionDays = recording?.retentionDays ?? 30;
  const atCap = recording?.atCap ?? true;

  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Storage</div>
        <h1 className="main-title">Recording storage</h1>
        <p className="main-sub">Video recordings, capacity, and retention</p>
      </div>
      <div className="main-body">

        {/* ── Upsell if not enabled ── */}
        {!enabled && (
          <div className="upgrade-banner to-pro" style={{ marginBottom: 20 }}>
            <div className="upgrade-banner-text">
              <strong>Recording not enabled</strong>
              Record your video sessions directly to R2. Download, share, or archive — add recording to your plan.
            </div>
            <a href="/pricing">
              <button className="upgrade-banner-cta">Add recording →</button>
            </a>
          </div>
        )}

        {/* ── Status card ── */}
        <div className="card">
          <div className="card-header">
            Storage status
            <span className="card-header-sub" style={{ color: enabled ? "var(--green)" : "var(--text-3)" }}>
              {enabled ? "● active" : "○ not enabled"}
            </span>
          </div>

          <div className="row">
            <div><div className="row-label">Resolution</div><div className="row-sub">Recording quality</div></div>
            <div className="row-value" style={{ color: enabled ? "var(--text)" : "var(--text-3)" }}>
              {enabled ? resolution : "—"}
            </div>
          </div>

          <div className="row">
            <div>
              <div className="row-label">Hours used this month</div>
              <div className="row-sub">Usage tracking coming soon</div>
            </div>
            <div className="row-value" style={{ color: "var(--text-3)" }}>
              {enabled ? `${hoursUsed} / ${maxHours} hrs` : "—"}
            </div>
          </div>

          {enabled && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <UsageBar used={hoursUsed} limit={maxHours} />
            </div>
          )}

          <div className="row">
            <div><div className="row-label">Retention</div><div className="row-sub">How long recordings are kept</div></div>
            <div className="row-value" style={{ color: enabled ? "var(--text-2)" : "var(--text-3)" }}>
              {enabled ? `${retentionDays} days` : "—"}
            </div>
          </div>

          <div className="row">
            <div><div className="row-label">Cap status</div><div className="row-sub">Recording will stop when at cap</div></div>
            <div className="row-value" style={{ color: atCap && enabled ? "var(--red)" : "var(--green)" }}>
              {!enabled ? "—" : atCap ? "At cap" : "Under cap"}
            </div>
          </div>
        </div>

        {/* ── What you have vs what's available ── */}
        <div className="card">
          <div className="card-header">Plan comparison</div>
          {UPGRADE_TIERS.map(t => {
            const isCurrent = enabled && resolution === t.res;
            const isHigher = enabled && resolution === "1080p" && t.res === "720p";
            return (
              <div className="row" key={t.res} style={{ opacity: isHigher ? 0.4 : 1 }}>
                <div>
                  <div className="row-label" style={{ color: isCurrent ? t.color : "var(--text)" }}>
                    {t.label}
                    {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, fontFamily: "var(--mono)", color: t.color }}>← your plan</span>}
                  </div>
                  <div className="row-sub">{t.res} · {t.hours}h/mo · {t.retention} retention</div>
                </div>
                <div className="row-value" style={{ color: t.color }}>{t.price}</div>
              </div>
            );
          })}
        </div>

        {/* ── Recordings list — coming soon ── */}
        <div className="card" style={{ opacity: 0.45 }}>
          <div className="card-header">
            Recordings
            <span className="card-header-sub">coming soon</span>
          </div>
          {[
            { label: "Session list", sub: "Browse all recorded sessions" },
            { label: "Per-session recap", sub: "Link to /s/:code/recap with video player" },
            { label: "Download", sub: "Download raw chunks or assembled video" },
            { label: "Share link", sub: "Pro: shareable link with expiry" },
          ].map(r => (
            <div className="row" key={r.label}>
              <div><div className="row-label">{r.label}</div><div className="row-sub">{r.sub}</div></div>
              <div className="row-value" style={{ color: "var(--text-3)" }}>—</div>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}