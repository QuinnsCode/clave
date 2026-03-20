"use client";
// app/components/DashboardClient/PluginsTab.tsx

import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";

interface Props {
  transcription: ResolvedTranscriptionPlugin | null;
  recording:     ResolvedRecordingPlugin | null;
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { bg: string; color: string }> = {
  free:    { bg: "rgba(255,255,255,0.04)",  color: "var(--text-3)"   },
  trial:   { bg: "rgba(124,58,237,0.12)",   color: "var(--purple-l)" },
  pro:     { bg: "rgba(124,58,237,0.18)",   color: "#c4b5fd"         },
  creator: { bg: "rgba(194,119,58,0.15)",   color: "#d4924e"         },
  founder: { bg: "rgba(34,197,94,0.12)",    color: "var(--green)"    },
  god:     { bg: "rgba(34,197,94,0.12)",    color: "var(--green)"    },
};

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_BADGE[tier] ?? TIER_BADGE.free;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 100, fontSize: 10,
      fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase",
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
    }}>{tier}</span>
  );
}

// ── Mode badge ────────────────────────────────────────────────────────────────

const MODE_COLOR: Record<string, string> = {
  active: "var(--green)", trial: "var(--purple-l)", sample: "var(--amber)", disabled: "var(--text-3)",
};

function ModeBadge({ mode }: { mode: string }) {
  const color = MODE_COLOR[mode] ?? "var(--text-3)";
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 100, fontSize: 10,
      fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase",
      color, border: `1px solid ${color}55`, background: `${color}11`,
    }}>{mode}</span>
  );
}

// ── Spell slot health bar ─────────────────────────────────────────────────────

function SpellSlots({ used, total, unlimited }: { used: number; total: number; unlimited?: boolean }) {
  const SLOTS = 10;
  const pct   = unlimited ? 0 : total > 0 ? Math.min(used / total, 1) : 0;
  const filled = unlimited ? 0 : Math.round(pct * SLOTS);

  const slotColor = (i: number) => {
    if (unlimited) return "var(--green)";
    if (filled === SLOTS) return "var(--red)";
    if (filled >= 8) return i < filled ? "var(--amber)" : undefined;
    return i < filled ? "var(--purple-l)" : undefined;
  };

  const slotGlow = (i: number) => {
    if (unlimited) return `0 0 6px var(--green)`;
    if (i >= filled) return "none";
    if (filled === SLOTS) return `0 0 6px var(--red)`;
    if (filled >= 8) return `0 0 5px var(--amber)`;
    return `0 0 5px var(--purple-l)`;
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: SLOTS }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 10, borderRadius: 100,
          background: unlimited
            ? "var(--green)"
            : i < filled
              ? (slotColor(i) ?? "var(--purple-l)")
              : "var(--bg-3)",
          border: `1px solid ${unlimited ? "var(--green)" : i < filled ? (slotColor(i) ?? "var(--purple-l)") : "var(--border)"}`,
          boxShadow: i < filled || unlimited ? slotGlow(i) : "none",
          opacity: unlimited ? 0.5 : i < filled ? 1 : 0.4,
          transition: "all 0.3s ease",
        }} />
      ))}
      {unlimited && (
        <span style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)", marginLeft: 4 }}>∞</span>
      )}
    </div>
  );
}

// ── Plugin marketplace card ───────────────────────────────────────────────────

function PluginCard({
  name,
  description,
  tier,
  mode,
  enabled,
  slots,
  details,
  action,
  comingSoon,
}: {
  name:        string;
  description: string;
  tier?:       string;
  mode?:       string;
  enabled?:    boolean;
  slots?:      { used: number; total: number; unlimited?: boolean; label: string };
  details?:    { label: string; value: string }[];
  action?:     React.ReactNode;
  comingSoon?: boolean;
}) {
  return (
    <div style={{
      background: "var(--bg-2)",
      border: `1px solid ${enabled ? "var(--border-p)" : "var(--border)"}`,
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 16,
      opacity: comingSoon ? 0.5 : 1,
      boxShadow: enabled ? "0 0 30px rgba(124,58,237,0.06)" : "none",
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: `1px solid var(--border)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{name}</span>
          {tier && <TierBadge tier={tier} />}
          {comingSoon && (
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>
              COMING SOON
            </span>
          )}
        </div>
        {mode && !comingSoon && <ModeBadge mode={mode} />}
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* Description */}
        <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: slots || details ? 16 : 0, lineHeight: 1.6 }}>
          {description}
        </p>

        {/* Spell slot bar */}
        {slots && (
          <div style={{ marginBottom: details ? 16 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {slots.label}
              </span>
              <a href="#usage" style={{ fontSize: 11, color: "var(--purple-l)", fontFamily: "var(--mono)" }}>
                → usage
              </a>
            </div>
            <SpellSlots used={slots.used} total={slots.total} unlimited={slots.unlimited} />
          </div>
        )}

        {/* Key details */}
        {details && details.length > 0 && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: action ? 16 : 0 }}>
            {details.map(d => (
              <div key={d.label}>
                <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                  {d.label}
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--mono)" }}>{d.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        {action && <div style={{ marginTop: details || slots ? 4 : 0 }}>{action}</div>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PluginsTab({ transcription, recording }: Props) {
  const t = transcription;
  const r = recording;

  const tEnabled   = t?.enabled ?? false;
  const tMode      = t?.mode ?? "disabled";
  const tUnlimited = tEnabled && (t?.capMinutes ?? 0) === 0;
  const tUsed      = t?.minutesUsed ?? 0;
  const tCap       = tMode === "trial" ? (t?.trialCapMinutes ?? 60) : (t?.capMinutes ?? 0);

  const rEnabled = r?.enabled ?? false;
  const rMode    = rEnabled ? "active" : "disabled";

  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Dashboard</div>
        <h1 className="main-title tracking-widest">Plugins</h1>
      </div>
      <div className="main-body">

        <PluginCard
          name="Live Transcription"
          description={
            tEnabled
              ? "Real-time captions and full transcript saved after every session."
              : "Add real-time transcription to your video calls. Try it free — no card required."
          }
          tier={t?.tier}
          mode={tMode}
          enabled={tEnabled}
          slots={tEnabled ? {
            used:      tUsed,
            total:     tCap,
            unlimited: tUnlimited,
            label:     tMode === "trial" ? "Trial minutes" : "Monthly minutes",
          } : undefined}
          details={tEnabled ? [
            { label: "Model",     value: t?.modelKey ?? "—" },
            { label: "Cap",       value: tUnlimited ? "∞" : `${tCap.toLocaleString()} min` },
          ] : undefined}
          action={!tEnabled ? (
            <button className="btn btn-primary btn-sm" onClick={async () => {
              await fetch("/api/qlave/plugins/transcription/enable", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "trial" }),
              });
              window.location.reload();
            }}>
              Start free trial
            </button>
          ) : tMode === "trial" ? (
            <a href="/pricing"><button className="btn btn-outline btn-sm">Upgrade → Billing</button></a>
          ) : null}
        />

        <PluginCard
          name="Session Recording"
          description={
            rEnabled
              ? "Store & Save your session audio & video calls long-term and at tiers of quality!"
              : "Add recording to your plan. (Note: Session Recording plugin will need to be enabled for post transciption to work)"
          }
          tier={rEnabled ? (r?.resolution === "1080p" ? "creator" : "pro") : undefined}
          mode={rMode}
          enabled={rEnabled}
          slots={rEnabled ? {
            used:  r?.hoursUsed ?? 0,
            total: r?.maxHoursPerMonth ?? 0,
            label: "Monthly hours",
          } : undefined}
          details={rEnabled ? [
            { label: "Resolution", value: r?.resolution ?? "720p" },
            { label: "Retention",  value: `${r?.retentionDays ?? 30} days` },
          ] : undefined}
          action={!rEnabled ? (
            <a href="/pricing"><button className="btn btn-primary btn-sm">Add recording → Billing</button></a>
          ) : null}
        />

        <PluginCard
          name="Collaborative Whiteboard"
          description="Draw, diagram, and brainstorm together in real time during your sessions."
          comingSoon
        />

        <PluginCard
          name="Collaborative Doc"
          description="A shared document that lives inside your session. Edit together, export after."
          comingSoon
        />

        <PluginCard
          name="Meeting Summary"
          description="AI-generated summary, key moments, and action items after every session."
          comingSoon
        />

      </div>
    </>
  );
}