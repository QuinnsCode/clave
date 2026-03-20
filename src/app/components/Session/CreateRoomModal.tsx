"use client";
// src/app/components/Session/CreateRoomModal.tsx

import { useState } from "react";
import type { RoomConfig } from "@/lib/qlave/roomCode";
import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";

interface Props {
  transcription: ResolvedTranscriptionPlugin | null;
  recording:     ResolvedRecordingPlugin | null;
  maxPeers:      number;
  onConfirm:     (config: RoomConfig) => Promise<void>;
  onClose:       () => void;
}

const CSS = `
.modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal {
  width: 100%; max-width: 460px;
  background: #0d0d1a; border: 1px solid rgba(124,58,237,0.25);
  border-radius: 18px; overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(124,58,237,0.08);
  font-family: 'DM Sans', system-ui, sans-serif;
}
.modal-header {
  padding: 22px 26px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: space-between;
}
.modal-title {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 22px; color: #ece8f8;
}
.modal-close {
  background: none; border: none; color: #4a4660;
  font-size: 18px; cursor: pointer; padding: 4px 8px;
  border-radius: 6px; transition: color 0.15s; line-height: 1;
}
.modal-close:hover { color: #ece8f8; }
.modal-body { padding: 22px 26px; display: flex; flex-direction: column; gap: 18px; }
.modal-footer {
  padding: 14px 26px 22px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex; justify-content: flex-end; gap: 10px;
}
.modal-divider { height: 1px; background: rgba(255,255,255,0.06); }

.setting-row {
  display: flex; align-items: center;
  justify-content: space-between; gap: 16px;
}
.setting-label { flex: 1; }
.setting-title {
  font-size: 14px; font-weight: 500; color: #ece8f8; margin-bottom: 2px;
}
.setting-sub {
  font-size: 12px; color: #4a4660; line-height: 1.5;
}
.setting-sub.warn { color: #fbbf24; }

.toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-track {
  position: absolute; inset: 0; border-radius: 100px;
  background: #111120; border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer; transition: all 0.2s;
}
.toggle-track::before {
  content: ''; position: absolute;
  width: 14px; height: 14px; border-radius: 50%;
  left: 3px; top: 3px;
  background: #4a4660; transition: all 0.2s;
}
.toggle input:checked + .toggle-track {
  background: #7c3aed; border-color: #7c3aed;
  box-shadow: 0 0 10px rgba(124,58,237,0.4);
}
.toggle input:checked + .toggle-track::before {
  transform: translateX(18px); background: #fff;
}
.toggle input:disabled + .toggle-track {
  opacity: 0.3; cursor: not-allowed;
}

.res-group { display: flex; gap: 6px; }
.res-btn {
  flex: 1; padding: 7px 0; border-radius: 7px;
  font-size: 12px; font-weight: 600; font-family: 'DM Mono', monospace;
  cursor: pointer; border: 1px solid rgba(255,255,255,0.08);
  background: #111120; color: #4a4660; transition: all 0.15s;
}
.res-btn.active {
  background: rgba(124,58,237,0.15);
  border-color: rgba(124,58,237,0.4);
  color: #a78bfa;
}
.res-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.peers-row { display: flex; flex-direction: column; gap: 8px; }
.peers-header { display: flex; justify-content: space-between; }
.peers-title { font-size: 14px; font-weight: 500; color: #ece8f8; }
.peers-val { font-size: 13px; color: #a78bfa; font-family: 'DM Mono', monospace; }
.peers-sub { font-size: 12px; color: #4a4660; }
input[type=range].peers-slider {
  width: 100%; appearance: none; height: 4px;
  background: #111120; border-radius: 100px; outline: none; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.06);
}
input[type=range].peers-slider::-webkit-slider-thumb {
  appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: #a78bfa; box-shadow: 0 0 8px rgba(124,58,237,0.5); cursor: pointer;
}

.btn-cancel {
  padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
  background: transparent; border: 1px solid rgba(255,255,255,0.08);
  color: #918caa; cursor: pointer; transition: all 0.15s;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.btn-cancel:hover { border-color: rgba(255,255,255,0.16); color: #ece8f8; }
.btn-create {
  padding: 9px 24px; border-radius: 8px; font-size: 13px; font-weight: 600;
  background: #7c3aed; border: none; color: #fff; cursor: pointer;
  transition: all 0.15s; box-shadow: 0 2px 16px rgba(124,58,237,0.35);
  font-family: 'DM Sans', system-ui, sans-serif; min-width: 130px;
}
.btn-create:hover { background: #6d28d9; transform: translateY(-1px); }
.btn-create:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.lock-badge {
  font-size: 10px; font-family: 'DM Mono', monospace; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2px 8px; border-radius: 100px;
  background: rgba(255,255,255,0.04); color: #4a4660;
  border: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
}
`;

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" />
    </label>
  );
}

export default function CreateRoomModal({ transcription, recording, maxPeers, onConfirm, onClose }: Props) {
  const hasTranscription = transcription?.enabled ?? false;
  const hasRecording     = recording?.enabled ?? false;
  const can1080          = recording?.resolution === "1080p";
  const tierMaxPeers = maxPeers;

  const [config, setConfig] = useState<RoomConfig>({
    maxPeers:              tierMaxPeers,
    transcription:         hasTranscription,
    storeTranscript:       hasTranscription && hasRecording,
    postSessionTranscribe: false,
    recording:             hasRecording,
    recordingResolution:   (recording?.resolution as "720p" | "1080p") ?? "720p",
  });
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }));

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(config); }
    finally { setLoading(false); }
  };

  // Dependency enforcement
  const storeTranscriptAvailable = config.transcription && hasRecording;
  const postTranscribeAvailable  = config.transcription && config.recording && hasRecording;

  return (
    <>
      <style>{CSS}</style>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>

          <div className="modal-header">
            <span className="modal-title">Room settings</span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">

            {/* ── Transcription ── */}
            <div className="setting-row">
              <div className="setting-label">
                <div className="setting-title">Live transcription</div>
                <div className={`setting-sub ${!hasTranscription ? "warn" : ""}`}>
                  {hasTranscription ? "Real-time captions for all participants" : "Enable transcription plugin to use"}
                </div>
              </div>
              {hasTranscription
                ? <Toggle checked={config.transcription} onChange={v => {
                    set("transcription", v);
                    if (!v) { set("storeTranscript", false); set("postSessionTranscribe", false); }
                  }} />
                : <span className="lock-badge">upgrade</span>
              }
            </div>

            {/* ── Store transcript ── */}
            <div className="setting-row">
              <div className="setting-label">
                <div className="setting-title">Save transcript</div>
                <div className={`setting-sub ${!storeTranscriptAvailable ? "warn" : ""}`}>
                  {!hasRecording ? "Requires recording plugin" : !config.transcription ? "Requires transcription on" : "Save live transcript after session"}
                </div>
              </div>
              {hasRecording
                ? <Toggle checked={config.storeTranscript} onChange={v => set("storeTranscript", v)} disabled={!storeTranscriptAvailable} />
                : <span className="lock-badge">upgrade</span>
              }
            </div>

            <div className="modal-divider" />

            {/* ── Recording ── */}
            <div className="setting-row">
              <div className="setting-label">
                <div className="setting-title">Record session</div>
                <div className={`setting-sub ${!hasRecording ? "warn" : ""}`}>
                  {hasRecording ? "Store audio & video to R2" : "Enable recording plugin to use"}
                </div>
              </div>
              {hasRecording
                ? <Toggle checked={config.recording} onChange={v => {
                    set("recording", v);
                    if (!v) set("postSessionTranscribe", false);
                  }} />
                : <span className="lock-badge">upgrade</span>
              }
            </div>

            {/* ── Post-session transcribe ── */}
            <div className="setting-row">
              <div className="setting-label">
                <div className="setting-title">Post-session transcribe</div>
                <div className={`setting-sub ${!postTranscribeAvailable ? "warn" : ""}`}>
                  {!hasRecording ? "Requires recording plugin" : !config.recording ? "Requires recording on" : !config.transcription ? "Requires transcription on" : "Full accuracy pass after session ends"}
                </div>
              </div>
              {hasRecording && hasTranscription
                ? <Toggle checked={config.postSessionTranscribe} onChange={v => set("postSessionTranscribe", v)} disabled={!postTranscribeAvailable} />
                : <span className="lock-badge">upgrade</span>
              }
            </div>

            {/* ── Resolution ── */}
            {hasRecording && (
              <>
                <div className="modal-divider" />
                <div className="setting-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                  <div className="setting-label">
                    <div className="setting-title">Recording quality</div>
                    <div className="setting-sub">720p saves storage — 1080p if you need the detail</div>
                  </div>
                  <div className="res-group" style={{ width: "100%" }}>
                    <button className={`res-btn ${config.recordingResolution === "720p" ? "active" : ""}`} onClick={() => set("recordingResolution", "720p")}>
                      720p
                    </button>
                    <button
                      className={`res-btn ${config.recordingResolution === "1080p" ? "active" : ""}`}
                      onClick={() => can1080 && set("recordingResolution", "1080p")}
                      disabled={!can1080}
                    >
                      1080p {!can1080 && "↑"}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="modal-divider" />

            {/* ── Max peers ── */}
            <div className="peers-row">
              <div className="peers-header">
                <div>
                  <span className="peers-title">Max participants</span>
                  <div className="peers-sub">Limit who can join — your tier allows up to {tierMaxPeers}</div>
                </div>
                <span className="peers-val">{config.maxPeers === 2 ? "1v1 only" : config.maxPeers}</span>
              </div>
              <input
                type="range" className="peers-slider"
                min={2} max={tierMaxPeers} step={1}
                value={config.maxPeers}
                onChange={e => set("maxPeers", parseInt(e.target.value))}
              />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#4a4660", fontFamily: "'DM Mono', monospace" }}>1v1</span>
                <span style={{ fontSize: 11, color: "#4a4660", fontFamily: "'DM Mono', monospace" }}>{tierMaxPeers} max</span>
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-create" onClick={handleConfirm} disabled={loading}>
              {loading ? "Creating…" : "Create room →"}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}