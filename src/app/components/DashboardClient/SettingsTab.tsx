"use client";
// src/app/components/DashboardClient/SettingsTab.tsx

import { useState, useEffect, useCallback } from "react";
import { mergeSettings } from "@/lib/userSettings";
import type { UserSettings } from "@/lib/userSettings";

interface Props {
  user: { id: string; name: string | null; email: string | null };
  site: { id: string; siteKey: string } | null;
}

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: "relative", width: 40, height: 22, flexShrink: 0, display: "inline-block" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{
        position: "absolute", inset: 0, borderRadius: 100,
        background: checked ? "var(--purple)" : "var(--bg-3)",
        border: `1px solid ${checked ? "var(--purple)" : "var(--border)"}`,
        cursor: "pointer", transition: "all 0.2s",
        boxShadow: checked ? "0 0 10px var(--purple-g)" : "none",
      }}>
        <span style={{
          position: "absolute", width: 14, height: 14, borderRadius: "50%",
          background: checked ? "#fff" : "var(--text-3)",
          top: 3, left: checked ? 21 : 3, transition: "all 0.2s",
        }} />
      </span>
    </label>
  );
}

export default function SettingsTab({ user, site }: Props) {
  const [siteKey, setSiteKey]   = useState(site?.siteKey ?? null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [settings, setSettings] = useState(mergeSettings(null));
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Load settings from DO on mount
  useEffect(() => {
    fetch(`/__user-session?userId=${user.id}&action=settings`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.settings) setSettings(mergeSettings(data.settings));
      })
      .catch(() => {/* use defaults */});
  }, [user.id]);

  const save = useCallback(async (patch: Partial<UserSettings>) => {
    const merged = mergeSettings({ ...settings, ...patch, room: { ...settings.room, ...(patch.room ?? {}) } });
    setSettings(merged);
    setSaving(true);
    try {
        await fetch(`/__user-session?userId=${user.id}&action=settings`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(patch),
        })
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [settings, user.id]);

  const rotate = async () => {
    if (!confirm("Rotate your site key? Your current embed code will stop working immediately.")) return;
    setRotating(true);
    try {
      const res  = await fetch("/api/qlave/rotate-site-key", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { siteKey: string };
      setSiteKey(data.siteKey);
    } catch { alert("Failed to rotate key — try again."); }
    finally { setRotating(false); }
  };

  const copy = () => {
    if (!siteKey) return;
    navigator.clipboard.writeText(siteKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="main-header">
        <div className="main-eyebrow">Settings</div>
        <h1 className="main-title">Settings</h1>
        <p className="main-sub">
          Preferences, room defaults, and integrations
          {saving && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--mono)" }}>saving…</span>}
          {saved  && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--green)",  fontFamily: "var(--mono)" }}>✓ saved</span>}
        </p>
      </div>
      <div className="main-body">

        {/* ── Appearance ── */}
        <div className="card">
          <div className="card-header">Appearance</div>
          <div className="row">
            <div><div className="row-label">Theme</div><div className="row-sub">Synced across devices</div></div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["dark","light","system"] as const).map(t => (
                <button key={t} onClick={() => save({ theme: t })} style={{
                  padding: "4px 12px", borderRadius: 100, fontSize: 11,
                  fontFamily: "var(--mono)", cursor: "pointer", transition: "all 0.15s",
                  background: settings.theme === t ? "var(--purple-g2)" : "var(--bg-3)",
                  border: `1px solid ${settings.theme === t ? "var(--border-p)" : "var(--border)"}`,
                  color: settings.theme === t ? "var(--purple-l)" : "var(--text-3)",
                }}>
                  {t === "dark" ? "Dark" : t === "light" ? "Light" : "System"}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <div><div className="row-label">Session list view</div><div className="row-sub">Grid or list layout</div></div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["grid","list"] as const).map(v => (
                <button key={v} onClick={() => save({ sessionListView: v })} style={{
                  padding: "4px 12px", borderRadius: 100, fontSize: 11,
                  fontFamily: "var(--mono)", cursor: "pointer", transition: "all 0.15s",
                  background: settings.sessionListView === v ? "var(--purple-g2)" : "var(--bg-3)",
                  border: `1px solid ${settings.sessionListView === v ? "var(--border-p)" : "var(--border)"}`,
                  color: settings.sessionListView === v ? "var(--purple-l)" : "var(--text-3)",
                }}>
                  {v === "grid" ? "⊞ Grid" : "≡ List"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Identity ── */}
        <div className="card">
          <div className="card-header">Identity</div>
          <div className="row">
            <div><div className="row-label">Timezone</div><div className="row-sub">Used for session timestamps</div></div>
            <select
              value={settings.timezone}
              onChange={e => save({ timezone: e.target.value })}
              style={{
                background: "var(--bg-3)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text)", fontSize: 13,
                padding: "6px 10px", fontFamily: "var(--mono)", cursor: "pointer",
              }}
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="row">
            <div><div className="row-label">Language</div><div className="row-sub">Interface language</div></div>
            <select
              value={settings.language}
              onChange={e => save({ language: e.target.value })}
              style={{
                background: "var(--bg-3)", border: "1px solid var(--border)",
                borderRadius: 8, color: "var(--text)", fontSize: 13,
                padding: "6px 10px", fontFamily: "var(--mono)", cursor: "pointer",
              }}
            >
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="row">
            <div><div className="row-label">Pronouns</div><div className="row-sub">Shown in video rooms</div></div>
            <input
              className="field-input"
              placeholder="they/them"
              defaultValue={settings.pronouns}
              onBlur={e => save({ pronouns: e.target.value })}
              style={{ width: 140 }}
            />
          </div>
        </div>

        {/* ── Room defaults ── */}
        <div className="card">
          <div className="card-header">Room defaults<span className="card-header-sub">used when creating a room</span></div>
          {[
            { key: "transcription",         label: "Live transcription",      sub: "Captions on by default" },
            { key: "storeTranscript",        label: "Save transcript",         sub: "Store after session ends" },
            { key: "postSessionTranscribe",  label: "Post-session transcribe", sub: "Full accuracy pass after session" },
            { key: "recording",              label: "Record session",          sub: "Store audio & video to R2" },
            { key: "requirePasscode",        label: "Require passcode",        sub: "Extra code to join" },
            { key: "allowGuests",            label: "Allow guests",            sub: "Non-authenticated users can join" },
          ].map(({ key, label, sub }) => (
            <div className="row" key={key}>
              <div><div className="row-label">{label}</div><div className="row-sub">{sub}</div></div>
              <Toggle
                checked={!!(settings.room as any)[key]}
                onChange={v => save({ room: { [(key)]: v } })}
              />
            </div>
          ))}
          <div className="row">
            <div><div className="row-label">Default resolution</div><div className="row-sub">Recording quality</div></div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["720p","1080p"] as const).map(r => (
                <button key={r} onClick={() => save({ room: { recordingResolution: r } })} style={{
                  padding: "4px 12px", borderRadius: 100, fontSize: 11,
                  fontFamily: "var(--mono)", cursor: "pointer", transition: "all 0.15s",
                  background: settings.room.recordingResolution === r ? "var(--purple-g2)" : "var(--bg-3)",
                  border: `1px solid ${settings.room.recordingResolution === r ? "var(--border-p)" : "var(--border)"}`,
                  color: settings.room.recordingResolution === r ? "var(--purple-l)" : "var(--text-3)",
                }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <div>
              <div className="row-label">Default max peers</div>
              <div className="row-sub">Room size limit</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--purple-l)", fontFamily: "var(--mono)", minWidth: 24, textAlign: "right" }}>
                {settings.room.maxPeers}
              </span>
              <input
                type="range" min={2} max={12} step={1}
                value={settings.room.maxPeers}
                onChange={e => setSettings(s => mergeSettings({ ...s, room: { ...s.room, maxPeers: parseInt(e.target.value) } }))}
                onMouseUp={e => save({ room: { maxPeers: parseInt((e.target as HTMLInputElement).value) } })}
                style={{ width: 100, accentColor: "var(--purple-l)" }}
              />
            </div>
          </div>
        </div>

        {/* ── Site key ── */}
        <div className="card">
          <div className="card-header">Site key</div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
              Scopes rooms to your site. Anyone with this key can create rooms under your account.
            </p>
            <div className="key-box">
              <span>{siteKey}</span>
              <button className="btn btn-outline btn-sm" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <button className="btn btn-outline btn-sm" onClick={rotate} disabled={rotating}>
              {rotating ? "Rotating…" : "Rotate key"}
            </button>
          </div>
        </div>

        {/* ── Embed ── */}
        <div className="card">
          <div className="card-header">Embed snippet</div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>Drop this before &lt;/body&gt; on any page.</p>
            <div className="code-block" onClick={() => navigator.clipboard.writeText(`<script src="https://cdn.qlave.dev/latest/widget.js" data-site="${siteKey}"></script>`)}>
              <span className="copy-hint">copy</span>
              {`<script src="https://cdn.qlave.dev/latest/widget.js"\n  data-site="${siteKey}">\n</script>`}
            </div>
          </div>
        </div>

        {/* ── Notifications ── */}
        <div className="card" style={{ opacity: 0.5 }}>
          <div className="card-header">Notifications<span className="card-header-sub">coming soon</span></div>
          {["Room activity digest", "Usage alerts", "Product updates"].map(label => (
            <div className="row" key={label}>
              <div className="row-label">{label}</div>
              <button className="btn btn-outline btn-sm" disabled>Off</button>
            </div>
          ))}
        </div>

        {/* ── Danger ── */}
        <div className="card danger-card" style={{ opacity: 0.5 }}>
          <div className="card-header">Danger zone</div>
          <div className="row">
            <div>
              <div className="row-label">Delete account</div>
              <div className="row-sub">Permanently removes your account and all data</div>
            </div>
            <button className="btn btn-danger btn-sm" disabled>Delete</button>
          </div>
        </div>

      </div>
    </>
  );
}