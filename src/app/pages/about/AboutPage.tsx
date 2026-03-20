// src/app/pages/static/about/AboutPage.tsx
import { Drum } from "lucide-react";

export default function AboutPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      color: "#ece8f8",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080810; }
        a { color: #a78bfa; text-decoration: none; }
        a:hover { text-decoration: underline; }
        h1 { font-family: 'Josefin Sans', sans-serif; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        h2 { font-family: 'Josefin Sans', sans-serif; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
        .pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 12px; border-radius: 100px;
          background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
          font-size: 13px; font-weight: 600; color: #fff;
          text-decoration: none; font-family: 'Josefin Sans', sans-serif;
          letter-spacing: 0.14em; text-transform: uppercase;
        }
      `}</style>

      {/* Header */}
      <header style={{
        padding: "16px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center",
      }}>
        <a href="/" className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</a>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 32px 100px" }}>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4660", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          About
        </p>
        <h1 style={{ fontSize: 40, color: "#ece8f8", marginBottom: 48 }}>
          Why qlave exists
        </h1>

        <Section title="The problem">
          <P>
            I wanted to do a video call with my Commander group. Not a full Discord server. Not a Zoom link that expires. Not "download this app first." Just a link — share it, everyone joins, we play.
          </P>
          <P>
            That didn't exist in a way I liked. So I built it.
          </P>
        </Section>

        <Section title="What it is">
          <P>
            qlave is a peer-to-peer video and audio calling layer for the web. The simplest version: you get a link, you share it, anyone who clicks joins the call. No account required to join. No servers touching your audio or video — it goes directly between browsers.
          </P>
          <P>
            On top of that, every room includes live transcription. It's the part that makes it more than just a call — and it's what took this from a personal weekend tool to something worth sharing.
          </P>
          <P>
            The more powerful version: drop one script tag on any website and a floating video pill appears for your users. Built for game nights, useful everywhere.
          </P>
        </Section>

        <Section title="Who built this">
          <P>
            One person — Ryan Quinn, based in San Diego. I build small, useful web tools under <a href="https://qntbr.com">qntbr</a>. qlave started as a personal tool and became something I wanted to share.
          </P>
          <P>
            The stack is Cloudflare Workers + Durable Objects + React via RedwoodSDK. WebRTC for the P2P layer. The calls themselves are genuinely cheap to run at scale — transcription is the part with real infrastructure cost, and that's what the paid plans will cover when we get there.
          </P>
        </Section>

        <Section title="The honest version">
          <P>
            This is not a VC-backed startup. There's no growth team, no roadmap deck, no Series A. It's a tool I use, that I think other people will find useful, built and hosted as lean as possible.
          </P>
          <P>
            We're in alpha. No billing is active. You get a trial allocation of transcription minutes to kick the tires — calls are always free. When billing goes live, early supporters who signed up during alpha can lock in $96 for their first year ($8/month). Everyone else goes monthly at $10. You'll get at least 30 days notice before anything is charged.
          </P>
          <P>
            AI infrastructure costs move. I've built margin in so the price can stay reasonable — but I'm not going to promise it won't change after year one. What I will promise: early adopters get taken care of. Bonused, prioritized, remembered. That's the deal.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions, bugs, feedback, custom needs: <a href="mailto:hey@qlave.dev">hey@qlave.dev</a>
          </P>
        </Section>

      </main>

      <footer style={{
        padding: "24px 32px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: 24, justifyContent: "center",
        fontSize: 13, color: "#4a4660",
      }}>
        <a href="/">Home</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <h2 style={{ fontSize: 14, color: "#ece8f8", marginBottom: 14, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'Josefin Sans', sans-serif" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, color: "#918caa", lineHeight: 1.8, marginBottom: 12 }}>
      {children}
    </p>
  );
}