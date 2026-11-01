"use client";
// src/app/components/qollab/QollabDocEditor.tsx
// Word doc style editor — fixed 8.5x11 canvas, contenteditable, basic formatting.
// Paste images → client resizes to webp, embeds inline.
// Attribution shown per paragraph on hover.

import { useRef, useEffect, useCallback, useState } from "react";
import { encodeDocImage } from "@/lib/qollab/imageCodec";
import type { DocContent } from "@/durableObjects/qollabWhiteboardDO";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  doc:      DocContent;
  peerId:   string;
  canEdit:  boolean;
  onChange: (content: string) => void;
  onRename: (title: string) => void;
  onClose:  () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// 8.5 x 11 inches at 96dpi
const DOC_W = 816;
const DOC_H = 1056;

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
.doc-wrap {
  position: absolute; inset: 0; overflow-y: auto;
  background: #0d0d1a; display: flex; flex-direction: column;
  font-family: 'DM Sans', sans-serif;
}

/* ── Doc toolbar ── */
.doc-toolbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 2px;
  padding: 8px 16px; background: rgba(8,8,16,0.95);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  backdrop-filter: blur(12px); flex-shrink: 0; flex-wrap: wrap;
}
.doc-toolbar-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 30px; height: 30px; padding: 0 6px; border-radius: 6px;
  background: transparent; border: none; color: #918caa;
  cursor: pointer; transition: all 0.15s; font-size: 13px;
  font-family: inherit;
}
.doc-toolbar-btn:hover { background: rgba(255,255,255,0.06); color: #ece8f8; }
.doc-toolbar-btn.active { background: rgba(124,58,237,0.2); color: #a78bfa; }
.doc-divider {
  width: 1px; height: 20px;
  background: rgba(255,255,255,0.08); margin: 0 4px;
}
.doc-title-input {
  flex: 1; min-width: 120px; background: transparent; border: none;
  color: #ece8f8; font-size: 14px; font-weight: 600;
  font-family: 'Instrument Serif', Georgia, serif;
  outline: none; padding: 0 8px;
}
.doc-title-input::placeholder { color: #4a4660; }
.doc-close {
  margin-left: auto; display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px; border: none;
  background: transparent; color: #4a4660; cursor: pointer; transition: all 0.15s;
  font-size: 16px;
}
.doc-close:hover { background: rgba(248,113,113,0.1); color: #f87171; }

/* ── Page ── */
.doc-page-wrap {
  flex: 1; display: flex; justify-content: center;
  padding: 32px 16px 80px; min-height: ${DOC_H + 64}px;
}
.doc-page {
  width: ${DOC_W}px; min-height: ${DOC_H}px;
  background: #f9f9ff; border-radius: 4px;
  box-shadow: 0 4px 40px rgba(0,0,0,0.5);
  padding: 72px 80px; position: relative;
  color: #1a1528;
}

/* ── Editor ── */
.doc-editor {
  min-height: ${DOC_H - 144}px; outline: none;
  font-size: 15px; line-height: 1.7; color: #1a1528;
  font-family: 'DM Sans', sans-serif;
  caret-color: #7c3aed;
}
.doc-editor:empty::before {
  content: attr(data-placeholder);
  color: #9890b0; pointer-events: none;
}
.doc-editor h1 {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 28px; font-weight: 400; margin: 0 0 16px; line-height: 1.3;
  color: #0d0d1a;
}
.doc-editor h2 {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 22px; font-weight: 400; margin: 24px 0 12px; line-height: 1.4;
  color: #1a1528;
}
.doc-editor p { margin: 0 0 12px; }
.doc-editor ul, .doc-editor ol { margin: 0 0 12px; padding-left: 24px; }
.doc-editor li { margin-bottom: 4px; }
.doc-editor strong { font-weight: 700; }
.doc-editor em { font-style: italic; }
.doc-editor u { text-decoration: underline; }
.doc-editor img {
  max-width: 100%; height: auto; border-radius: 4px;
  display: block; margin: 12px 0;
}
.doc-editor a { color: #7c3aed; text-decoration: underline; }

/* ── Read only ── */
.doc-readonly-badge {
  position: absolute; top: 16px; right: 16px;
  font-size: 10px; font-family: 'DM Mono', monospace;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: #9890b0; background: rgba(0,0,0,0.06);
  padding: 3px 8px; border-radius: 100px;
}

@media (max-width: 900px) {
  .doc-page { width: 100%; padding: 40px 32px; }
  .doc-page-wrap { padding: 16px 8px 60px; }
}
`;

// ── Formatting commands ───────────────────────────────────────────────────────

const FORMATS: { cmd: string; value?: string; label: string; title: string }[] = [
  { cmd: "bold",          label: "B",  title: "Bold (⌘B)" },
  { cmd: "italic",        label: "I",  title: "Italic (⌘I)" },
  { cmd: "underline",     label: "U",  title: "Underline (⌘U)" },
  { cmd: "formatBlock",   value: "h1", label: "H1", title: "Heading 1" },
  { cmd: "formatBlock",   value: "h2", label: "H2", title: "Heading 2" },
  { cmd: "formatBlock",   value: "p",  label: "P",  title: "Paragraph" },
  { cmd: "insertUnorderedList", label: "•—", title: "Bullet list" },
  { cmd: "insertOrderedList",   label: "1.", title: "Numbered list" },
];

function execFmt(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

function isActive(cmd: string): boolean {
  try { return document.queryCommandState(cmd); }
  catch { return false; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QollabDocEditor({
  doc, peerId, canEdit, onChange, onRename, onClose,
}: Props) {
  const editorRef   = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(doc.title);
  const [, forceRender]   = useState(0);

  // Hydrate editor content once
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = doc.content || "";
  }, [doc.id]); // only on doc switch

  // Sync incoming content changes from other peers
  useEffect(() => {
    if (!editorRef.current) return;
    // Only update if not focused (don't interrupt typing)
    if (document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = doc.content || "";
    }
  }, [doc.content]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    onChange(editorRef.current.innerHTML);
    forceRender(n => n + 1); // re-render to update active format buttons
  }, [onChange]);

  const handleTitleBlur = useCallback(() => {
    if (title !== doc.title) onRename(title);
  }, [title, doc.title, onRename]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editorRef.current?.focus();
    }
  }, []);

  // Paste image handling
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (!imageItem) return; // let browser handle text paste normally

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const encoded = await encodeDocImage(file);
    const bytes   = new Uint8Array(encoded.data, 8);
    const blob    = new Blob([bytes], { type: "image/webp" });
    const url     = URL.createObjectURL(blob);

    // Insert image at cursor
    const img     = document.createElement("img");
    img.src       = url;
    img.style.maxWidth = "100%";

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current?.appendChild(img);
    }

    handleInput();
  }, [handleInput]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey)) {
      if (e.key === "b") { e.preventDefault(); execFmt("bold"); }
      if (e.key === "i") { e.preventDefault(); execFmt("italic"); }
      if (e.key === "u") { e.preventDefault(); execFmt("underline"); }
    }
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className="doc-wrap">

        {/* Toolbar */}
        <div className="doc-toolbar">
          <input
            className="doc-title-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            disabled={!canEdit}
          />

          <div className="doc-divider" />

          {FORMATS.map(f => (
            <button
              key={f.cmd + (f.value ?? "")}
              className={`doc-toolbar-btn ${isActive(f.cmd) ? "active" : ""}`}
              title={f.title}
              onMouseDown={e => {
                e.preventDefault(); // keep editor focus
                execFmt(f.cmd, f.value);
                forceRender(n => n + 1);
              }}
              disabled={!canEdit}
              style={
                f.label === "B" ? { fontWeight: 700 } :
                f.label === "I" ? { fontStyle: "italic" } :
                f.label === "U" ? { textDecoration: "underline" } :
                {}
              }
            >
              {f.label}
            </button>
          ))}

          <button className="doc-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Page */}
        <div className="doc-page-wrap">
          <div className="doc-page">
            {!canEdit && <div className="doc-readonly-badge">view only</div>}
            <div
              ref={editorRef}
              className="doc-editor"
              contentEditable={canEdit}
              suppressContentEditableWarning
              onInput={handleInput}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              data-placeholder={canEdit ? "Start typing…" : ""}
              spellCheck
            />
          </div>
        </div>

      </div>
    </>
  );
}