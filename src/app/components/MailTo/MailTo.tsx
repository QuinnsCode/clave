"use client";
// src/app/components/MailTo.tsx
// Renders children as a trigger, opens a popup with copy + mailto options.
// No mailto: link fires automatically — user chooses.

import { useState, useRef, useEffect } from "react";
import { Copy, Check, Mail, X } from "lucide-react";

interface Props {
  email:     string;
  subject?:  string;
  children:  React.ReactNode;
}

const CSS = `
.mailto-wrap { position: relative; display: inline-flex; }

.mailto-popup {
  position: absolute; bottom: calc(100% + 10px); left: 50%;
  transform: translateX(-50%);
  background: #0d0d1a; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; padding: 16px; width: 280px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6); z-index: 100;
  font-family: 'DM Sans', sans-serif;
  animation: mtFadeIn 0.15s ease;
}
@keyframes mtFadeIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.mailto-popup-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.mailto-popup-title {
  font-size: 12px; font-weight: 600; color: #918caa;
  font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em;
}
.mailto-close {
  background: none; border: none; color: #4a4660; cursor: pointer;
  padding: 2px; display: flex; align-items: center; border-radius: 4px;
  transition: color 0.15s;
}
.mailto-close:hover { color: #ece8f8; }

.mailto-email-row {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; padding: 9px 12px; margin-bottom: 10px;
}
.mailto-email-text {
  flex: 1; font-family: 'DM Mono', monospace; font-size: 13px;
  color: #a78bfa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mailto-copy-btn {
  background: none; border: none; color: #4a4660; cursor: pointer;
  padding: 2px; display: flex; align-items: center; border-radius: 4px;
  transition: all 0.15s; flex-shrink: 0;
}
.mailto-copy-btn:hover { color: #a78bfa; }
.mailto-copy-btn.copied { color: #22c55e; }

.mailto-open-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
  background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.25);
  color: #a78bfa; font-size: 13px; font-family: inherit; transition: all 0.15s;
}
.mailto-open-btn:hover { background: rgba(124,58,237,0.2); }
`;

export default function MailTo({ email, subject, children }: Props) {
  const [open,   setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef             = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleCopy() {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const href = subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mailto-wrap" ref={wrapRef}>

        {/* Trigger — renders whatever children are passed */}
        <div onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
          {children}
        </div>

        {/* Popup */}
        {open && (
          <div className="mailto-popup">
            <div className="mailto-popup-header">
              <span className="mailto-popup-title">Contact</span>
              <button className="mailto-close" onClick={() => setOpen(false)}>
                <X size={13} />
              </button>
            </div>

            {/* Email + copy */}
            <div className="mailto-email-row">
              <span className="mailto-email-text">{email}</span>
              <button
                className={`mailto-copy-btn ${copied ? "copied" : ""}`}
                onClick={handleCopy}
                title="Copy email"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Open in mail client */}
            <a href={href} target="_blank" rel="noreferrer">
              <button className="mailto-open-btn">
                <Mail size={14} /> Open in mail app
              </button>
            </a>
          </div>
        )}
      </div>
    </>
  );
}