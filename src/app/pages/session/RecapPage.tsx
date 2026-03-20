// src/app/pages/session/RecapPage.tsx
import { AppContext } from "@/worker";
import { db } from "@/db";
import { Drum } from "lucide-react";
import DownloadButton from "@/app/components/Session/DownloadButton";

type Chunk = {
  peerId: string;
  displayName: string;
  text: string;
  timestamp: number;
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function buildPlainText(chunks: Chunk[], sessionId: string): string {
  const lines = [
    `QLAVE SESSION TRANSCRIPT`,
    `Session: ${sessionId}`,
    `Date: ${chunks[0] ? formatDate(chunks[0].timestamp) : "Unknown"}`,
    `Participants: ${[...new Set(chunks.map(c => c.displayName))].join(", ")}`,
    ``,
    `─────────────────────────────────────────`,
    ``,
  ];
  for (const c of chunks) {
    lines.push(`[${formatTime(c.timestamp)}] ${c.displayName}`);
    lines.push(c.text);
    lines.push("");
  }
  return lines.join("\n");
}

export default async function RecapPage({
  ctx,
  params,
}: {
  ctx: AppContext;
  params: { code: string };
}) {
  const sessionId = params.code;

  if (!ctx.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/user/login?next=/s/${sessionId}/recap` },
    });
  }

  const record = await db.sessionTranscript.findFirst({
    where: { sessionId },
  });

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #080810; color: #e2e2f0; min-height: 100vh; }
    a { color: inherit; text-decoration: none; }

    .header {
      padding: 16px 32px;
      border-bottom: 1px solid #1e1e3a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0d0d1a;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .logo {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 100px;
      background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
      font-size: 13px; font-weight: 600; color: #fff;
    }
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .btn {
      font-size: 13px; font-weight: 500; padding: 7px 14px;
      border-radius: 7px; cursor: pointer; border: none;
      font-family: inherit; transition: opacity 0.15s;
    }
    .btn-secondary {
      background: #1a1a2e; color: #a0a0c0;
      border: 1px solid #2a2a4a;
    }
    .btn-secondary:hover { border-color: #7c3aed; color: #e2e2f0; }
    .btn-primary { background: #7c3aed; color: #fff; }
    .btn-primary:hover { opacity: 0.85; }

    .wrap { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }
    .meta { margin-bottom: 32px; }
    .meta-title { font-size: 20px; font-weight: 600; color: #e2e2f0; margin-bottom: 6px; }
    .meta-sub { font-size: 13px; color: #666; font-family: monospace; }

    .chunk { margin-bottom: 20px; }
    .chunk-header {
      display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px;
    }
    .chunk-name { font-size: 12px; font-weight: 600; color: #a78bfa; }
    .chunk-time { font-size: 11px; color: #444; font-family: monospace; }
    .chunk-text {
      font-size: 14px; line-height: 1.65; color: #c8c4e0;
      padding-left: 12px; border-left: 2px solid #1e1e3a;
    }

    .empty {
      text-align: center; padding: 80px 20px; color: #444;
    }
    .empty-title { font-size: 16px; margin-bottom: 8px; color: #666; }
    .empty-sub { font-size: 13px; }
  `;

  if (!record) {
    return (
      <html>
        <head><title>Recap — Qlave</title><style dangerouslySetInnerHTML={{ __html: CSS }} /></head>
        <body>
          <div className="header">
            <a className="logo" href="/"><Drum size={13} strokeWidth={2.5} /> qlave</a>
            <a className="btn btn-secondary" href="/dashboard">← Dashboard</a>
          </div>
          <div className="wrap">
            <div className="empty">
              <div className="empty-title">No transcript found</div>
              <div className="empty-sub">This session either has no transcript or it hasn't been saved yet.</div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  let chunks: Chunk[] = [];
  try {
    chunks = JSON.parse(record.chunks) as Chunk[];
  } catch {
    chunks = [];
  }

  const plainText = buildPlainText(chunks, sessionId);
  const date = chunks[0] ? formatDate(chunks[0].timestamp) : "Session";
  const participants = [...new Set(chunks.map(c => c.displayName))];

  return (
    <html>
      <head>
        <title>Recap — Qlave</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <div className="header">
          <a className="logo" href="/"><Drum size={13} strokeWidth={2.5} /> qlave</a>
          <div className="header-actions">
            <a className="btn btn-secondary" href="/dashboard">← Dashboard</a>
            <DownloadButton text={plainText} sessionId={sessionId} />
          </div>
        </div>

        <div className="wrap">
          <div className="meta">
            <div className="meta-title">{date} · {participants.join(", ")}</div>
            <div className="meta-sub">{sessionId.slice(0, 16)}… · {chunks.length} segments</div>
          </div>

          {chunks.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Empty transcript</div>
              <div className="empty-sub">No speech was captured in this session.</div>
            </div>
          ) : (
            chunks.map((chunk, i) => (
              <div key={i} className="chunk">
                <div className="chunk-header">
                  <span className="chunk-name">{chunk.displayName}</span>
                  <span className="chunk-time">{formatTime(chunk.timestamp)}</span>
                </div>
                <div className="chunk-text">{chunk.text}</div>
              </div>
            ))
          )}
        </div>
      </body>
    </html>
  );
}