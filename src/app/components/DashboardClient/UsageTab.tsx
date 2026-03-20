"use client";
// app/components/DashboardClient/UsageTab.tsx

import type { MonthlyStats, SessionLog } from "./DashboardClient";
import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { bg: string; color: string }> = {
  free:    { bg: "rgba(255,255,255,0.04)",    color: "var(--text-3)"  },
  trial:   { bg: "rgba(124,58,237,0.12)",     color: "var(--purple-l)"},
  pro:     { bg: "rgba(124,58,237,0.18)",     color: "#c4b5fd"        },
  creator: { bg: "rgba(194,119,58,0.15)",     color: "#d4924e"        },
  founder: { bg: "rgba(34,197,94,0.12)",      color: "var(--green)"   },
};

function TierBadge({ tier }: { tier: string }) {
  const style = TIER_BADGE[tier] ?? TIER_BADGE.free;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 100, fontSize: 10,
      fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase",
      background: style.bg, color: style.color,
      border: `1px solid ${style.color}22`,
    }}>
      {tier}
    </span>
  );
}

// ── Meter ─────────────────────────────────────────────────────────────────────

function Meter({ used, limit, unit, sub, unlimited }: {
  used: number; limit: number; unit: string; sub?: string; unlimited?: boolean;
}) {
  const pct      = unlimited || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  const barColor = pct > 90 ? "var(--red)" : pct > 70 ? "var(--amber)" : "linear-gradient(90deg, var(--purple-d), var(--purple-l))";
  const usedFmt  = used % 1 === 0 ? used.toLocaleString() : used.toFixed(1);
  const limitFmt = unlimited ? "∞" : limit.toLocaleString();
  const pctLabel = unlimited ? "Unlimited" : limit > 0 ? `${Math.round(pct)}% used` : "—";

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontSize: 28, fontFamily: "var(--serif)", color: "var(--text)", lineHeight: 1 }}>
          {usedFmt}
          <span style={{ fontSize: 14, color: "var(--text-3)", marginLeft: 6, fontFamily: "var(--mono)" }}>
            / {limitFmt} {unit}
          </span>
        </span>
        <span style={{ fontSize: 12, color: unlimited ? "var(--green)" : pct > 70 ? "var(--amber)" : "var(--text-3)", fontFamily: "var(--mono)" }}>
          {pctLabel}
        </span>
      </div>
      <div className="usage-bar" style={{ height: 8, borderRadius: 100 }}>
        <div className="usage-fill" style={{
          width: unlimited ? "100%" : limit > 0 ? `${pct}%` : "4px",
          background: unlimited ? "linear-gradient(90deg, var(--purple-d), var(--green))" : barColor,
          opacity: unlimited ? 0.4 : 1,
        }} />
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, fontFamily: "var(--mono)" }}>{sub}</div>}
    </div>
  );
}

// ── Plugin usage card ─────────────────────────────────────────────────────────

function PluginUsageCard({ title, tier, mode, children, cta }: {
  title:    string;
  tier:     string;
  mode:     string;
  children: React.ReactNode;
  cta?:     React.ReactNode;
}) {
  const modeColor: Record<string, string> = {
    active: "var(--green)", trial: "var(--purple-l)", sample: "var(--amber)", disabled: "var(--text-3)",
  };
  return (
    <div className="card">
      <div className="card-header">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          <TierBadge tier={tier} />
        </span>
        <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: modeColor[mode] ?? "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {mode}
        </span>
      </div>
      <div className="card-body">
        {children}
        {cta && <div style={{ marginTop: 16 }}>{cta}</div>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UsageTab({
  monthly,
  transcription,
  recording,
}: {
  monthly:       MonthlyStats;
  transcription: ResolvedTranscriptionPlugin | null;
  recording:     ResolvedRecordingPlugin | null;
}) {
  const now    = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 1).getDate() - now.getDate();

  const isTrial     = transcription?.mode === "trial";
  const isActive    = transcription?.mode === "active";
  const isUnlimited = isActive && (transcription?.capMinutes ?? 0) === 0;
  const minutesUsed = transcription?.minutesUsed ?? 0;
  const cap         = isTrial ? (transcription?.trialCapMinutes ?? 60) : (transcription?.capMinutes ?? 0);
  const pct         = isUnlimited ? 0 : cap > 0 ? Math.min((minutesUsed / cap) * 100, 100) : 0;

  const recEnabled  = recording?.enabled ?? false;
  const recHours    = recording?.hoursUsed ?? 0;
  const recCap      = recording?.maxHoursPerMonth ?? 0;

  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Usage</div>
        <h1 className="main-title">This month</h1>
        <p className="main-sub">{daysLeft} days left · resets 1st of the month</p>
      </div>
      <div className="main-body">

        {/* ── Transcription meter ── */}
        {transcription && transcription.mode !== "disabled" && (
          <PluginUsageCard
            title="Transcription"
            tier={transcription.tier}
            mode={transcription.mode}
            cta={pct > 70 && !isUnlimited ? (
              <a href="/pricing">
                <button className="btn btn-primary btn-sm">
                  {pct > 90 ? "⚠ Upgrade now — almost out" : "Upgrade for more minutes →"}
                </button>
              </a>
            ) : undefined}
          >
            <Meter
              used={minutesUsed}
              limit={cap}
              unit="min"
              unlimited={isUnlimited}
              sub={isTrial
                ? `Trial total · expires ${transcription.trialEndsAt ? new Date(transcription.trialEndsAt).toLocaleDateString() : "—"}`
                : isUnlimited ? "Unlimited — founder tier" : `${cap - minutesUsed > 0 ? (cap - minutesUsed).toLocaleString() : "0"} min remaining this month`
              }
            />
          </PluginUsageCard>
        )}

        {/* ── Recording meter ── */}
        {recEnabled && (
          <PluginUsageCard
            title="Recording"
            tier={recording?.resolution === "1080p" ? "creator" : "pro"}
            mode="active"
          >
            <Meter
              used={recHours}
              limit={recCap}
              unit="hrs"
              sub="Usage tracking coming soon — showing estimated"
            />
          </PluginUsageCard>
        )}

        {/* ── Sessions this month ── */}
        <div className="card">
          <div className="card-header">
            Sessions
            <span className="card-header-sub">{now.toLocaleString("default", { month: "long" })}</span>
          </div>
          <div className="row">
            <div><div className="row-label">Total sessions</div></div>
            <div className="row-value" style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--text)" }}>{monthly.sessionCount}</div>
          </div>
          <div className="row">
            <div><div className="row-label">Peak peers in a session</div></div>
            <div className="row-value">{monthly.peakPeers}</div>
          </div>
          <div className="row">
            <div><div className="row-label">Total peer-minutes</div></div>
            <div className="row-value">{Math.floor(monthly.totalDurationMs / 60000).toLocaleString()} min</div>
          </div>
        </div>

      </div>
    </>
  );
}