// src/app/pages/legal/TermsPage.tsx
import { Drum } from "lucide-react";

export default function TermsPage() {
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
        h1, h2 { font-family: 'Instrument Serif', Georgia, serif; }
        .pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 12px; border-radius: 100px;
          background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
          font-size: 13px; font-weight: 600; color: #fff;
          text-decoration: none;
        }
      `}</style>

      <header style={{
        padding: "16px 32px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center",
      }}>
        <a href="/" className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</a>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 32px 100px" }}>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4660", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
          Legal
        </p>
        <h1 style={{ fontSize: 40, color: "#ece8f8", marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: "#4a4660", fontFamily: "'DM Mono', monospace", marginBottom: 48 }}>
          Last updated: March 2026
        </p>

        <Section title="1. What qlave is">
          <P>
            qlave is a peer-to-peer audio and video communication layer with live transcription. It provides
            signaling infrastructure to help browsers establish direct connections with each other. Once
            connected, media travels directly between participants — qlave's servers never see, process,
            or store your calls.
          </P>
          <P>
            The platform, system design, and infrastructure are the original work of Ryan Quinn. All rights reserved.
          </P>
        </Section>

        <Section title="2. Alpha status and billing">
          <P>
            qlave is currently in alpha. <strong style={{ color: "#ece8f8" }}>No billing is active.</strong> You
            will not be charged for anything during this period. Calls are peer-to-peer and cost us nothing
            to run — they will remain free. Transcription is the service with real infrastructure cost, and
            that is what future paid plans will cover.
          </P>
          <P>
            When billing goes live, we will give at least <strong style={{ color: "#ece8f8" }}>30 days' notice</strong> before
            any charges are applied. You will have the opportunity to opt in, downgrade, or cancel before
            anything is billed.
          </P>
        </Section>

        <Section title="3. Trial transcription">
          <P>
            During alpha, each account receives a trial allocation of transcription minutes. These minutes
            are shared across all participants in a session — the total pool is divided by the number of
            active participants, so larger rooms consume trial minutes faster.
          </P>
          <P>
            Trial minutes are a lifetime allocation, not a monthly reset. When your trial allocation is
            exhausted, transcription pauses until you upgrade or contact us for an extension.
          </P>
          <P>
            A limited number of early users may receive an increased trial allocation by contacting us
            directly. This is subject to availability and our discretion.
          </P>
        </Section>

        <Section title="4. Early bird pricing">
          <P>
            Users who sign up during alpha are eligible for early bird pricing. When billing goes live,
            early bird supporters may pay $96 upfront for their first year ($8/month effective).
            Everyone else pays $10/month on a rolling monthly basis.
          </P>
          <P>
            After the first year, early bird pricing will likely increase as AI infrastructure costs
            evolve — standard pricing may also rise over time. Early supporters will receive ongoing
            loyalty treatment and bonuses at our discretion. An exclusive launch bonus will be
            communicated when billing goes live.
          </P>
          <P>
            Early bird eligibility does not create a binding contract or guarantee of service. It is
            an informal commitment we honor to supporters who sign up during alpha. We will give at
            least 30 days notice before any payment is required.
          </P>
          <P>
            For power usage, higher transcription limits, custom data needs, or volume pricing, contact
            us directly at <a href="mailto:theqntbr@gmail.com">theqntbr@gmail.com</a>.
          </P>
        </Section>

        <Section title="5. Peer-to-peer risks">
          <P>
            Because qlave uses direct browser-to-browser connections (WebRTC), your IP address may be
            visible to other participants in a session. This is a fundamental property of peer-to-peer
            communication, not a bug.
          </P>
          <P>
            If you share a room link, anyone with that link can attempt to join. Only share links with
            people you trust. Private rooms and access controls are on the roadmap.
          </P>
          <P>
            qlave does not encrypt signaling messages beyond what HTTPS provides. Media streams use
            DTLS-SRTP encryption as specified by the WebRTC standard.
          </P>
        </Section>

        <Section title="6. What we collect">
          <P>
            qlave collects the minimum necessary to operate: your email address and name when you create
            an account, basic session metadata (when sessions start and end, participant counts) for
            usage tracking, and transcription usage counts for trial enforcement. We do not record,
            store, or have access to your audio or video.
          </P>
          <P>
            Session room codes are stored temporarily and expire after 24 hours.
          </P>
        </Section>

        <Section title="7. Coming services">
          <P>
            We plan to introduce additional services in the future, including video storage and
            VOD (video-on-demand) capabilities, expanded transcription plans, power-user and
            compliance tiers, and private room controls. These services are not yet available.
          </P>
          <P>
            When storage services launch, they will involve materially different data handling —
            your recordings would be stored on our infrastructure. We will update these terms
            and the Privacy Policy before that happens, and notify users clearly. Continued use
            after a material update constitutes acceptance of the updated terms.
          </P>
        </Section>

        <Section title="8. No warranties">
          <P>
            qlave is provided as-is, in alpha. We make no guarantees about uptime, reliability,
            transcription accuracy, or fitness for any particular purpose. Signaling infrastructure
            can fail. Peer connections can drop. Don't rely on qlave for anything where failure
            has serious consequences.
          </P>
        </Section>

        <Section title="9. Acceptable use">
          <P>
            Don't use qlave to harass people, break laws, or do anything you wouldn't want traced
            back to you. We reserve the right to terminate accounts that violate this, with or
            without notice.
          </P>
        </Section>

        <Section title="10. Intellectual property">
          <P>
            The qlave platform, brand, system architecture, and codebase are the original work
            and intellectual property of Ryan Quinn. You may not copy, resell, or represent
            qlave's work as your own.
          </P>
          <P>
            The open source components qlave is built on retain their respective licenses.
          </P>
        </Section>

        <Section title="11. Limitation of liability">
          <P>
            To the maximum extent permitted by law, qlave and its creator are not liable for any
            damages arising from your use of the service — including but not limited to data loss,
            privacy exposure from peer-to-peer connections, transcription errors, or service interruptions.
          </P>
        </Section>

        <Section title="12. Changes to these terms">
          <P>
            These terms may be updated from time to time. Continued use of qlave after changes
            constitutes acceptance. Material changes — especially those related to billing or
            data storage — will be communicated directly and with at least 30 days' notice.
          </P>
        </Section>

        <Section title="13. Contact">
          <P>
            Questions? Reach out at <a href="mailto:theqntbr@gmail.com">theqntbr@gmail.com</a>.
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
        <a href="/about">About</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#ece8f8", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, color: "#918caa", lineHeight: 1.75, marginBottom: 12 }}>
      {children}
    </p>
  );
}