// src/app/pages/static/changelog/ChangelogPage.tsx

const entries = [
  {
    date: "March 2026",
    tag: "Infrastructure",
    title: "Middleware refactor + privacy page",
    items: [
      "Centralized route policy config — all CSP/auth rules in one file",
      "Split session vs org context — API routes now get ctx.user correctly",
      "Added Privacy Policy page",
      "Room URLs now preserve correct origin context",
    ],
  },
  {
    date: "March 2026",
    tag: "Product",
    title: "Hosted rooms + landing redesign",
    items: [
      "Hosted rooms at /s/:code — share a link, no embed needed",
      "Landing page reframed around the hosted room use case",
      "Josefin Sans font — wider tracking, tribal warmth to match the mark",
      "About, Terms, and Privacy pages added",
    ],
  },
  {
    date: "February 2026",
    tag: "Core",
    title: "WebRTC signaling aligned end-to-end",
    items: [
      "Fixed message type mismatch between QlaveSessionDO and SessionClient",
      "ice-candidate, peer-joined, peer-left all aligned",
      "Room code vs session UUID separation — codes are KV keys, UUIDs name DOs",
      "SessionPage expired state UI — rooms show as expired, not broken",
    ],
  },
  {
    date: "February 2026",
    tag: "Dashboard",
    title: "Room creation UX",
    items: [
      "ensureRoom pattern — room created once, reused for copy and open",
      "New room button to explicitly rotate the code",
      "Room URL generated server-side, no window.location.origin issues",
      "Subdomain stripping — shared links always resolve on main domain",
    ],
  },
  {
    date: "January 2026",
    tag: "Core",
    title: "Usage tracking",
    items: [
      "Live session state in KV — updated on joins, leaves, every 50th message",
      "Historical session logs in D1 — flushed when last peer leaves via DO alarm",
      "Dashboard stats: peak peers, session count, total duration",
      "Site key rotation with KV cache busting",
    ],
  },
  {
    date: "January 2026",
    tag: "Widget",
    title: "Widget + bookmarklet",
    items: [
      "Widget deployed to cdn.qlave.dev — single script tag embed",
      "Draggable pill UI, auth flow, session panel",
      "Bookmarklet for injecting qlave onto sites you don't control",
      "Lucide Drum icon throughout — no more emojis in UI",
    ],
  },
  {
    date: "December 2025",
    tag: "Launch",
    title: "Initial release",
    items: [
      "QlaveSessionDO — WebSocket hibernation, peer registry, signal relay",
      "Site key validation against D1 with KV cache",
      "BetterAuth + subdomain org scoping via qstart-rwsdk base",
      "Dashboard with embed code and session history",
    ],
  },
];

const tagColors: Record<string, { bg: string; color: string; border: string }> = {
  Infrastructure: { bg: "rgba(124,58,237,0.1)", color: "#a78bfa", border: "rgba(124,58,237,0.25)" },
  Product:        { bg: "rgba(194,119,58,0.1)", color: "#d4924e", border: "rgba(194,119,58,0.25)" },
  Core:           { bg: "rgba(34,197,94,0.08)", color: "#4ade80", border: "rgba(34,197,94,0.2)" },
  Dashboard:      { bg: "rgba(56,189,248,0.08)", color: "#7dd3fc", border: "rgba(56,189,248,0.2)" },
  Widget:         { bg: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "rgba(251,191,36,0.2)" },
  Launch:         { bg: "rgba(194,119,58,0.12)", color: "#d4924e", border: "rgba(194,119,58,0.3)" },
};

export default function ChangelogPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      color: "#ece8f8",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=DM+Mono:wght@400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080810; }
        a { color: #a78bfa; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 14px; border-radius: 100px;
          background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
          font-family: 'Josefin Sans', sans-serif;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: #fff; text-decoration: none;
        }
      `}</style>

      <header style={{
        padding: "16px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center",
      }}>
        <a href="/" className="pill">🥁 qlave</a>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 32px 100px" }}>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4660", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          Changelog
        </p>
        <h1 style={{
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: 40, fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: "#ece8f8", marginBottom: 8,
        }}>
          What's shipped
        </h1>
        <p style={{ fontSize: 14, color: "#4a4660", marginBottom: 56 }}>
          Built in public. No marketing speak.
        </p>

        {/* Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {entries.map((entry, i) => {
            const tc = tagColors[entry.tag] ?? tagColors.Core;
            return (
              <div key={i} style={{ display: "flex", gap: 24, paddingBottom: 40 }}>

                {/* Left: date + line */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 100, flexShrink: 0 }}>
                  <p style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10, color: "#4a4660",
                    letterSpacing: "0.08em", textAlign: "right",
                    width: "100%", paddingTop: 3,
                  }}>
                    {entry.date}
                  </p>
                  <div style={{
                    width: 1, flex: 1, marginTop: 10,
                    background: "rgba(255,255,255,0.06)",
                  }} />
                </div>

                {/* Right: content */}
                <div style={{
                  flex: 1,
                  background: "#0d0d1a",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: "24px 28px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{
                      fontFamily: "'Josefin Sans', sans-serif",
                      fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.16em", textTransform: "uppercase",
                      padding: "3px 10px", borderRadius: 100,
                      background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                    }}>
                      {entry.tag}
                    </span>
                  </div>

                  <h2 style={{
                    fontFamily: "'Josefin Sans', sans-serif",
                    fontSize: 17, fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    color: "#ece8f8", marginBottom: 16,
                  }}>
                    {entry.title}
                  </h2>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {entry.items.map((item, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: tc.color, marginTop: 7, flexShrink: 0,
                          opacity: 0.7,
                        }} />
                        <span style={{ fontSize: 13, color: "#918caa", lineHeight: 1.65 }}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer style={{
        padding: "24px 32px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: 24, justifyContent: "center",
        fontSize: 13, color: "#4a4660",
      }}>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}