// src/app/pages/legal/PrivacyPage.tsx
import { Drum } from "lucide-react";

export default function PrivacyPage() {
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
        <h1 style={{ fontSize: 40, color: "#ece8f8", marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: "#4a4660", fontFamily: "'DM Mono', monospace", marginBottom: 48 }}>
          Last updated: March 2026
        </p>

        <Section title="1. The short version">
          <P>
            qlave is a peer-to-peer calling layer with live transcription. Your audio and video travel
            directly between browsers — qlave's servers never see or store your media. Transcription
            processing happens in real time and we do not retain the content of transcriptions beyond
            your session. We collect the minimum needed to operate the service and nothing more.
          </P>
        </Section>

        <Section title="2. What we collect">
          <P>
            <strong style={{ color: "#ece8f8" }}>Account data:</strong> Your email address and
            display name when you sign up. Passwords are hashed and never stored in plain text.
          </P>
          <P>
            <strong style={{ color: "#ece8f8" }}>Session metadata:</strong> When sessions start
            and end, peak participant count, and message count. This is used for usage tracking
            on your dashboard. Room codes are stored temporarily and expire after 24 hours.
          </P>
          <P>
            <strong style={{ color: "#ece8f8" }}>Transcription usage:</strong> We track how many
            transcription minutes your account and session participants have consumed. This is a
            count only — we do not store the content of transcriptions after a session ends.
          </P>
          <P>
            <strong style={{ color: "#ece8f8" }}>What we don't collect:</strong> Your audio,
            video, or screen share content. We have no access to it — it goes peer-to-peer.
            Transcription content is processed ephemerally and not retained.
          </P>
        </Section>

        <Section title="3. Peer-to-peer and IP addresses">
          <P>
            WebRTC — the technology qlave is built on — establishes direct connections between
            browsers. As a result, your IP address may be visible to other participants in a
            room. This is inherent to how P2P works, not something qlave controls.
          </P>
          <P>
            If this concerns you, only join rooms with people you trust, or use a VPN.
          </P>
        </Section>

        <Section title="4. How we use your data">
          <P>
            Session metadata is used to populate your dashboard (recent sessions, usage stats).
            Transcription usage counts enforce trial limits. Your email is used for authentication
            and, if you've opted in, to communicate service updates. We don't send marketing emails.
            We don't run analytics on your behavior beyond what's needed to keep the service working.
          </P>
        </Section>

        <Section title="5. Who we share data with">
          <P>
            Nobody, for money. Ever. We use Cloudflare for infrastructure (Workers, KV, D1) —
            your data lives on their platform under their infrastructure terms. We don't have
            any advertising or data broker relationships.
          </P>
        </Section>

        <Section title="6. Data retention">
          <P>
            Room codes expire after 24 hours. Session logs and transcription usage counts are
            retained indefinitely unless you delete your account. Transcription content itself
            is not retained after a session ends. If you delete your account, your data is
            removed within 30 days.
          </P>
        </Section>

        <Section title="7. Planned future services — storage and VOD">
          <P>
            We plan to introduce optional video storage and VOD (video-on-demand) features in
            the future. If and when these services launch, they would involve storing recordings
            of your sessions on our infrastructure — a materially different data relationship
            than what exists today.
          </P>
          <P>
            Before any storage features become available, we will update this Privacy Policy and
            the Terms of Service, and notify users directly. If you continue using qlave after
            those updates, you are accepting the revised policy as it applies to storage features
            you choose to enable. Storage will be opt-in — your existing sessions and calls
            are not affected.
          </P>
          <P>
            If you have specific privacy, compliance, or data residency requirements related to
            future storage features, contact us at <a href="mailto:theqntbr@gmail.com">theqntbr@gmail.com</a> before they launch.
          </P>
        </Section>

        <Section title="8. Your rights">
          <P>
            You can request a copy of your data, correct it, or have it deleted by emailing
            us at <a href="mailto:theqntbr@gmail.com">theqntbr@gmail.com</a>. We'll respond within 30 days.
          </P>
        </Section>

        <Section title="9. Cookies">
          <P>
            We use one session cookie for authentication. No tracking cookies, no third-party
            ad cookies, no fingerprinting.
          </P>
        </Section>

        <Section title="10. Children">
          <P>
            qlave is not directed at children under 13. If you believe a child has created an
            account, contact us and we'll remove it.
          </P>
        </Section>

        <Section title="11. Changes">
          <P>
            If we make material changes to this policy — especially those related to billing,
            data storage, or transcription retention — we will update the date at the top,
            note what changed, and notify users directly with at least 30 days' notice.
            Continued use of qlave after changes means you accept the updated policy.
          </P>
        </Section>

        <Section title="12. Contact">
          <P>
            Questions about privacy, compliance needs, or data requests? Email <a href="mailto:theqntbr@gmail.com">theqntbr@gmail.com</a>.
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