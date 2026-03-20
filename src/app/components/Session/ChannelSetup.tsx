"use client";
// app/components/Session/ChannelSetup.tsx
// Optional pre-lobby step for multi-channel (USB interface) recording.
// Shown when user clicks "Multi-channel setup" in the lobby.
// Each row = one audio device → user assigns a name → adds to channel list.
// Channels persist into the session and feed useMultiChannel.

import { useState } from "react";
import { Plus, Mic, Trash2, RefreshCw, ChevronRight } from "lucide-react";
import type { AudioDevice, MultiChannel } from "@/app/hooks/useMultiChannel";

interface ChannelSetupProps {
  devices:       AudioDevice[];
  channels:      MultiChannel[];
  atCapacity:    boolean;
  onAdd:         (deviceId: string, label: string) => Promise<string | null>;
  onRemove:      (channelId: string) => void;
  onRename:      (channelId: string, label: string) => void;
  onRefresh:     () => void;
  onDone:        () => void;   // proceed to lobby / join
  onSkip:        () => void;   // skip multi-channel, use single mic as normal
}

export function ChannelSetup({
  devices, channels, atCapacity,
  onAdd, onRemove, onRename, onRefresh, onDone, onSkip,
}: ChannelSetupProps) {
  const [adding,     setAdding]     = useState<string | null>(null); // deviceId being added
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({});
  const [editing,    setEditing]    = useState<string | null>(null); // channelId being renamed

  const usedDeviceIds = new Set(channels.map(c => c.deviceId));

  const handleAdd = async (deviceId: string) => {
    const label = labelDraft[deviceId]?.trim() || devices.find(d => d.deviceId === deviceId)?.label || "Mic";
    setAdding(deviceId);
    await onAdd(deviceId, label);
    setAdding(null);
    setLabelDraft(prev => { const n = { ...prev }; delete n[deviceId]; return n; });
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:60,
      background:"rgba(8,8,16,0.97)", backdropFilter:"blur(12px)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"24px 16px", fontFamily:"'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ width:"100%", maxWidth:480 }}>

        {/* Header */}
        <div style={{ marginBottom:28 }}>
          <h2 style={{ fontSize:22, fontWeight:600, color:"#ece8f8", marginBottom:6 }}>
            Multi-channel setup
          </h2>
          <p style={{ fontSize:13, color:"#918caa", lineHeight:1.6 }}>
            Assign a name to each mic input. Each channel gets its own waveform,
            transcript lane, and speaker label in the export.
          </p>
        </div>

        {/* Active channels */}
        {channels.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#4a4660", marginBottom:10, fontFamily:"DM Mono,monospace" }}>
              Active channels ({channels.length}/8)
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {channels.map(ch => (
                <div key={ch.id} style={{
                  display:"flex", alignItems:"center", gap:10,
                  background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:10, padding:"9px 12px",
                }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:ch.color, boxShadow:`0 0 6px ${ch.color}`, flexShrink:0 }} />
                  {editing === ch.id ? (
                    <input
                      autoFocus
                      value={ch.label}
                      onChange={e => onRename(ch.id, e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={e => e.key === "Enter" && setEditing(null)}
                      style={{
                        flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(124,58,237,0.4)",
                        borderRadius:6, padding:"3px 8px", color:"#ece8f8", fontSize:13, fontFamily:"inherit",
                        outline:"none",
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditing(ch.id)}
                      style={{ flex:1, fontSize:13, fontWeight:500, color:"#ece8f8", cursor:"text" }}
                      title="Click to rename"
                    >
                      {ch.label}
                    </span>
                  )}
                  <span style={{ fontSize:11, color:"#4a4660", fontFamily:"DM Mono,monospace", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {devices.find(d => d.deviceId === ch.deviceId)?.label ?? ch.deviceId.slice(0,8)}
                  </span>
                  <button onClick={() => onRemove(ch.id)} style={{
                    background:"none", border:"none", color:"rgba(248,113,113,0.5)",
                    cursor:"pointer", padding:3, lineHeight:1, flexShrink:0,
                  }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available devices */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#4a4660", fontFamily:"DM Mono,monospace", flex:1 }}>
              Available inputs
            </span>
            <button onClick={onRefresh} style={{
              background:"none", border:"none", color:"#4a4660", cursor:"pointer", padding:2, lineHeight:1,
            }} title="Refresh device list">
              <RefreshCw size={13} />
            </button>
          </div>

          {devices.length === 0 && (
            <div style={{ fontSize:13, color:"#4a4660", fontStyle:"italic", padding:"12px 0" }}>
              No audio inputs found. Connect a USB audio interface and click refresh.
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {devices.filter(d => !usedDeviceIds.has(d.deviceId)).map(device => (
              <div key={device.deviceId} style={{
                display:"flex", alignItems:"center", gap:10,
                background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.05)",
                borderRadius:10, padding:"9px 12px",
                opacity: atCapacity ? 0.4 : 1,
              }}>
                <Mic size={14} color="#4a4660" style={{ flexShrink:0 }} />
                <input
                  placeholder={device.label}
                  value={labelDraft[device.deviceId] ?? ""}
                  onChange={e => setLabelDraft(prev => ({ ...prev, [device.deviceId]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && !atCapacity && handleAdd(device.deviceId)}
                  style={{
                    flex:1, background:"transparent", border:"none", color:"#ece8f8",
                    fontSize:13, fontFamily:"inherit", outline:"none", minWidth:0,
                  }}
                  disabled={atCapacity}
                />
                <button
                  onClick={() => handleAdd(device.deviceId)}
                  disabled={atCapacity || adding === device.deviceId}
                  style={{
                    display:"flex", alignItems:"center", gap:5,
                    background:"rgba(124,58,237,0.15)", border:"1px solid rgba(124,58,237,0.3)",
                    borderRadius:7, padding:"4px 10px", fontSize:12, color:"#a78bfa",
                    cursor: atCapacity ? "not-allowed" : "pointer",
                    fontFamily:"inherit", flexShrink:0,
                    opacity: adding === device.deviceId ? 0.6 : 1,
                  }}
                >
                  {adding === device.deviceId ? "…" : <><Plus size={11} /> Add</>}
                </button>
              </div>
            ))}
            {devices.filter(d => usedDeviceIds.has(d.deviceId)).map(device => (
              <div key={device.deviceId} style={{
                display:"flex", alignItems:"center", gap:10,
                background:"transparent", borderRadius:10, padding:"9px 12px",
                opacity:0.3,
              }}>
                <Mic size={14} color="#4a4660" style={{ flexShrink:0 }} />
                <span style={{ flex:1, fontSize:13, color:"#918caa" }}>{device.label}</span>
                <span style={{ fontSize:11, color:"#4a4660", fontFamily:"DM Mono,monospace" }}>in use</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onSkip} style={{
            flex:1, padding:"11px", borderRadius:9,
            background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
            color:"#918caa", fontSize:14, cursor:"pointer", fontFamily:"inherit",
          }}>
            Single mic
          </button>
          <button
            onClick={onDone}
            disabled={channels.length === 0}
            style={{
              flex:2, padding:"11px", borderRadius:9,
              background: channels.length > 0 ? "#7c3aed" : "rgba(124,58,237,0.2)",
              border:"none", color: channels.length > 0 ? "#fff" : "#6d28d9",
              fontSize:14, fontWeight:600, cursor: channels.length > 0 ? "pointer" : "not-allowed",
              fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7,
              boxShadow: channels.length > 0 ? "0 2px 20px rgba(124,58,237,0.35)" : "none",
            }}
          >
            Start with {channels.length} channel{channels.length !== 1 ? "s" : ""} <ChevronRight size={15} />
          </button>
        </div>

        <div style={{ marginTop:16, textAlign:"center", fontSize:12, color:"#4a4660" }}>
          Plug in a USB audio interface to see multiple inputs · up to 8 channels
        </div>
      </div>
    </div>
  );
}