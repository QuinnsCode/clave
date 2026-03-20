// src/app/pages/pricing/PricingContent.tsx
// Static shell — no "use client", no async. Imports reactive bits from PricingClient.

import { Drum, Zap, Brain, Lock, FileText, Users, Sparkles, Mic, Check, Mail } from "lucide-react";
import {
  type Tier,
  TierBanner,
  PricingHero,
  UpgradeSpotlight,
  CurrentTag,
  FreeCTA,
  ProCTA,
  CtaStrip,
} from "@/app/components/pricing/PricingClient";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'DM Sans',sans-serif;background:#080810;color:#ece8f8;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
button{font-family:inherit;cursor:pointer;border:none}
:root{
  --purple:#7c3aed;--purple-l:#a78bfa;--purple-g:rgba(124,58,237,0.28);--purple-g2:rgba(124,58,237,0.08);
  --amber:#c2773a;--amber-l:#d4924e;--amber-g:rgba(194,119,58,0.15);
  --green:#22c55e;--green-g:rgba(34,197,94,0.12);
  --bg:#080810;--bg-2:#0d0d1a;--bg-3:#111120;
  --border:rgba(255,255,255,0.06);--border-p:rgba(124,58,237,0.25);--border-a:rgba(194,119,58,0.2);
  --text:#ece8f8;--text-2:#918caa;--text-3:#4a4660;
  --tribal:'Josefin Sans',sans-serif;--mono:'DM Mono',monospace;
}
nav{display:flex;align-items:center;justify-content:space-between;padding:20px 52px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;background:rgba(8,8,16,0.88);backdrop-filter:blur(28px)}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;background:linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);font-family:var(--tribal);font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#fff;box-shadow:0 2px 18px var(--purple-g)}
.nav-links{display:flex;align-items:center;gap:6px}
.btn-ghost{padding:9px 18px;border-radius:8px;font-family:var(--tribal);font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;background:transparent;color:var(--text-2);transition:all 0.15s}
.btn-ghost:hover{color:var(--text);background:rgba(255,255,255,0.05)}
.btn-primary{padding:10px 24px;border-radius:9px;font-family:var(--tribal);font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;background:var(--purple);color:#fff;box-shadow:0 2px 18px var(--purple-g);transition:all 0.15s}
.btn-primary:hover{background:#6d28d9;transform:translateY(-1px)}
.page{max-width:1100px;margin:0 auto;padding:0 24px 100px}
.tier-banner{margin:32px 0 0;padding:18px 28px;border-radius:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.tier-banner.free{background:rgba(255,255,255,0.03);border:1px solid var(--border)}
.tier-banner.pro{background:rgba(124,58,237,0.08);border:1px solid var(--border-p)}
.tier-banner.founder{background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2)}
.tier-banner-left{display:flex;align-items:center;gap:12px}
.tier-banner-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tier-banner.free .tier-banner-dot{background:var(--text-3)}
.tier-banner.pro .tier-banner-dot{background:var(--purple-l);box-shadow:0 0 8px var(--purple-l)}
.tier-banner.founder .tier-banner-dot{background:var(--green);box-shadow:0 0 8px var(--green)}
.tier-banner-label{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase}
.tier-banner.free .tier-banner-label{color:var(--text-3)}
.tier-banner.pro .tier-banner-label{color:var(--purple-l)}
.tier-banner.founder .tier-banner-label{color:var(--green)}
.tier-banner-msg{font-size:13px;color:var(--text-2)}
.pricing-hero{padding:64px 0 56px;text-align:center;position:relative}
.pricing-hero::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(124,58,237,0.12) 0%,transparent 65%)}
.pricing-eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-3);margin-bottom:20px;position:relative;z-index:1}
.pricing-title{font-family:var(--tribal);font-size:clamp(36px,6vw,64px);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text);margin-bottom:16px;position:relative;z-index:1;line-height:1.05}
.pricing-title em{font-style:normal;color:var(--amber-l)}
.pricing-sub{font-size:16px;line-height:1.8;color:var(--text-2);max-width:500px;margin:0 auto;position:relative;z-index:1}
.cards-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:72px}
.plan-card{background:var(--bg-2);border:1px solid var(--border);border-radius:20px;padding:36px 32px 40px;display:flex;flex-direction:column;position:relative;overflow:hidden;transition:border-color 0.2s,transform 0.2s}
.plan-card:hover{transform:translateY(-2px)}
.plan-card.featured{border-color:var(--border-p);background:linear-gradient(160deg,#0f0d1f 0%,#0d0d1a 100%);box-shadow:0 0 60px rgba(124,58,237,0.12),0 0 0 1px rgba(124,58,237,0.15)}
.plan-card.current{box-shadow:0 0 0 2px var(--green),0 0 30px rgba(34,197,94,0.1)}
.plan-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.plan-card.pc-free::before{background:var(--border)}
.plan-card.pc-pro::before{background:linear-gradient(90deg,var(--purple),var(--purple-l))}
.plan-card.pc-contact::before{background:linear-gradient(90deg,var(--amber),var(--amber-l))}
.current-tag{position:absolute;top:16px;right:16px;background:var(--green-g);border:1px solid rgba(34,197,94,0.3);color:var(--green);font-family:var(--mono);font-size:9px;letter-spacing:0.14em;text-transform:uppercase;padding:3px 10px;border-radius:100px}
.plan-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--tribal);font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;padding:4px 12px;border-radius:100px;width:fit-content;margin-bottom:24px}
.plan-badge.bfree{background:rgba(255,255,255,0.04);color:var(--text-3);border:1px solid var(--border)}
.plan-badge.bpro{background:rgba(124,58,237,0.12);color:var(--purple-l);border:1px solid var(--border-p)}
.plan-badge.bcontact{background:rgba(194,119,58,0.12);color:var(--amber-l);border:1px solid var(--border-a)}
.plan-name{font-family:var(--tribal);font-size:22px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text);margin-bottom:8px}
.plan-desc{font-size:13px;line-height:1.7;color:var(--text-2);margin-bottom:28px;min-height:52px}
.plan-price-row{display:flex;align-items:baseline;gap:6px;margin-bottom:32px;padding-bottom:28px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.plan-price{font-family:var(--tribal);font-size:52px;font-weight:700;line-height:1;color:var(--text)}
.plan-price-sub{font-family:var(--mono);font-size:11px;color:var(--text-3);letter-spacing:0.08em}
.plan-price-note{font-family:var(--mono);font-size:10px;color:var(--purple-l);letter-spacing:0.1em;margin-left:4px;background:rgba(124,58,237,0.1);padding:3px 8px;border-radius:100px;border:1px solid rgba(124,58,237,0.2)}
.plan-price-note.amber{color:var(--amber-l);background:rgba(194,119,58,0.1);border-color:rgba(194,119,58,0.2)}
.plan-features{display:flex;flex-direction:column;gap:12px;flex:1}
.plan-feature{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--text-2);line-height:1.5}
.plan-feature-check{width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.plan-feature-check.yes{background:var(--green-g);color:var(--green)}
.plan-feature-check.no{background:rgba(255,255,255,0.03);color:var(--text-3)}
.plan-feature-check.pro{background:rgba(124,58,237,0.12);color:var(--purple-l)}
.plan-feature-check.amber{background:rgba(194,119,58,0.12);color:var(--amber-l)}
.plan-cta{margin-top:32px;padding:14px 24px;border-radius:10px;font-family:var(--tribal);font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;width:100%;transition:all 0.15s;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
.plan-cta.cfree{background:transparent;color:var(--text-2);border:1px solid var(--border)}
.plan-cta.cfree:hover{background:rgba(255,255,255,0.04);color:var(--text)}
.plan-cta.cpro{background:var(--purple);color:#fff;border:none;box-shadow:0 2px 20px var(--purple-g)}
.plan-cta.cpro:hover{background:#6d28d9;transform:translateY(-1px)}
.plan-cta.ccontact{background:linear-gradient(135deg,var(--amber),var(--amber-l));color:#fff;border:none}
.plan-cta.ccontact:hover{filter:brightness(1.1);transform:translateY(-1px)}
.plan-cta.ccurrent{background:transparent;color:var(--green);border:1px solid rgba(34,197,94,0.3);cursor:default}
.upgrade-spotlight{margin-bottom:72px;border-radius:20px;padding:48px 52px;position:relative;overflow:hidden}
.upgrade-spotlight.to-pro{background:linear-gradient(135deg,#0f0d1f,#0d0d1a);border:1px solid var(--border-p);box-shadow:0 0 80px rgba(124,58,237,0.08)}
.upgrade-spotlight.to-contact{background:var(--bg-2);border:1px solid var(--border)}
.upgrade-spotlight::before{content:'';position:absolute;top:-60px;right:-60px;width:300px;height:300px;border-radius:50%;pointer-events:none}
.upgrade-spotlight.to-pro::before{background:radial-gradient(circle,rgba(124,58,237,0.1) 0%,transparent 70%)}
.spot-inner{position:relative;z-index:1}
.spot-eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px}
.upgrade-spotlight.to-pro .spot-eyebrow{color:var(--purple-l)}
.upgrade-spotlight.to-contact .spot-eyebrow{color:var(--text-3)}
.spot-title{font-family:var(--tribal);font-size:clamp(24px,3vw,36px);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text);margin-bottom:12px;line-height:1.1}
.spot-title em{font-style:normal}
.upgrade-spotlight.to-pro .spot-title em{color:var(--purple-l)}
.spot-desc{font-size:14px;line-height:1.8;color:var(--text-2);max-width:600px;margin-bottom:32px}
.spot-perks{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:32px}
.spot-perk{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:100px;padding:6px 14px;font-size:12px;color:var(--text-2)}
.spot-cta{display:inline-flex;align-items:center;gap:10px;padding:15px 36px;border-radius:11px;font-family:var(--tribal);font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;border:none;transition:all 0.15s}
.spot-cta.to-pro{background:var(--purple);color:#fff;box-shadow:0 2px 24px var(--purple-g)}
.spot-cta.to-pro:hover{background:#6d28d9;transform:translateY(-1px)}
.spot-cta.to-contact{background:transparent;color:var(--text);border:1px solid var(--border-p)}
.spot-cta.to-contact:hover{background:var(--purple-g2)}
.why-section{margin-bottom:72px}
.why-header{text-align:center;margin-bottom:48px}
.section-eyebrow{font-family:var(--mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-3);margin-bottom:14px}
.section-title{font-family:var(--tribal);font-size:28px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text)}
.why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.why-card{background:var(--bg-2);padding:40px 32px;transition:background 0.2s}
.why-card:hover{background:var(--bg-3)}
.why-icon{color:var(--amber-l);margin-bottom:18px}
.why-title{font-family:var(--tribal);font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:var(--text);margin-bottom:10px}
.why-desc{font-size:13px;line-height:1.75;color:var(--text-2)}
.faq-section{margin-bottom:72px}
.faq-title{font-family:var(--tribal);font-size:22px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text);margin-bottom:28px;text-align:center}
.faq-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.faq-item{background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:24px 26px}
.faq-q{font-family:var(--tribal);font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text);margin-bottom:10px}
.faq-a{font-size:13px;line-height:1.75;color:var(--text-2)}
.cta-strip{text-align:center;padding:72px 24px;border-top:1px solid var(--border);position:relative;overflow:hidden}
.cta-strip::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 50% 80% at 50% 100%,rgba(124,58,237,0.1) 0%,transparent 65%)}
.cta-strip-title{font-family:var(--tribal);font-size:clamp(28px,4vw,48px);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text);margin-bottom:12px;position:relative;z-index:1}
.cta-strip-sub{font-size:15px;color:var(--text-2);margin-bottom:36px;position:relative;z-index:1}
.cta-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;position:relative;z-index:1}
.btn-amber-lg{padding:15px 40px;border-radius:11px;font-family:var(--tribal);font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;background:linear-gradient(135deg,var(--amber),var(--amber-l));color:#fff;border:none;cursor:pointer;transition:all 0.15s}
.btn-amber-lg:hover{transform:translateY(-1px);filter:brightness(1.1)}
.btn-purple-lg{padding:15px 40px;border-radius:11px;font-family:var(--tribal);font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;background:var(--purple);color:#fff;border:none;cursor:pointer;transition:all 0.15s}
.btn-purple-lg:hover{background:#6d28d9;transform:translateY(-1px)}
.btn-outline-lg{padding:15px 40px;border-radius:11px;font-family:var(--tribal);font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;background:transparent;color:var(--text);border:1px solid var(--border-p);transition:all 0.15s}
.btn-outline-lg:hover{background:rgba(124,58,237,0.08)}
footer{padding:28px 52px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.footer-brand{font-family:var(--tribal);font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;display:flex;align-items:center;gap:8px;color:var(--text-3)}
.footer-links{display:flex;gap:24px}
.footer-links a{font-family:var(--tribal);font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-3);transition:color 0.15s}
.footer-links a:hover{color:var(--text-2)}
@media(max-width:900px){
  .cards-grid{grid-template-columns:1fr;max-width:480px;margin:0 auto 72px}
  .why-grid{grid-template-columns:1fr}
  .faq-grid{grid-template-columns:1fr}
  .upgrade-spotlight{padding:32px 24px}
}
@media(max-width:768px){
  nav{padding:14px 20px}
  footer{flex-direction:column;gap:16px;text-align:center}
}
`;

function FC({ type }: { type: "yes" | "no" | "pro" | "amber" }) {
  return (
    <span className={`plan-feature-check ${type}`}>
      {type === "no" ? <span style={{ fontSize: 10 }}>—</span> : <Check size={9} strokeWidth={3} />}
    </span>
  );
}

interface Props {
  currentTier: Tier;
  isLoggedIn: boolean;
}

export default function PricingContent({ currentTier, isLoggedIn }: Props) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <nav>
        <a href="/"><span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span></a>
        <div className="nav-links">
          <a href="/"><button className="btn-ghost">Home</button></a>
          {isLoggedIn
            ? <a href="/dashboard"><button className="btn-primary">Dashboard</button></a>
            : <>
                <a href="/user/login"><button className="btn-ghost">Sign in</button></a>
                <a href="/user/signup"><button className="btn-primary">Try it free</button></a>
              </>
          }
        </div>
      </nav>

      <div className="page">
        <TierBanner currentTier={currentTier} isLoggedIn={isLoggedIn} />
        <PricingHero currentTier={currentTier} />
        <UpgradeSpotlight currentTier={currentTier} />

        {/* Cards */}
        <div className="cards-grid">

          {/* Trial */}
          <div className={`plan-card pc-free ${currentTier === "free" ? "current" : ""}`}>
            <CurrentTag tier="free" currentTier={currentTier} />
            <span className="plan-badge bfree">Trial</span>
            <div className="plan-name">Free Trial</div>
            <div className="plan-desc">Try the whole thing. Calls are free. You get 30 trial transcription minutes to feel the magic.</div>
            <div className="plan-price-row">
              <div className="plan-price">$0</div>
              <div className="plan-price-sub">no billing yet · alpha</div>
            </div>
            <div className="plan-features">
              {[
                { t: "yes", text: "Unlimited P2P video & audio calls" },
                { t: "yes", text: "Shareable room links — no account to join" },
                { t: "yes", text: "30 trial transcription minutes (lifetime)" },
                { t: "yes", text: "Minutes split across room participants" },
                { t: "no",  text: "Transcript saved after session" },
                { t: "no",  text: "AI session summary" },
              ].map(f => (
                <div className="plan-feature" key={f.text}><FC type={f.t as any} /><span>{f.text}</span></div>
              ))}
            </div>
            <FreeCTA currentTier={currentTier} />
          </div>

          {/* Early Bird Pro */}
          <div className={`plan-card pc-pro featured ${currentTier === "pro" ? "current" : ""}`}>
            <CurrentTag tier="pro" currentTier={currentTier} />
            <span className="plan-badge bpro"><Sparkles size={9} /> Early Adopter</span>
            <div className="plan-name">Pro</div>
            <div className="plan-desc">Pay one year upfront. Lock in $8/mo for year one — and get labeled an early adopter forever.</div>
            <div className="plan-price-row">
              <div className="plan-price">$96</div>
              <div className="plan-price-sub">/ year one upfront</div>
              <div className="plan-price-note">$8/mo effective</div>
            </div>
            <div className="plan-features">
              {[
                { t: "yes", text: "Everything in Trial" },
                { t: "pro", text: "600 transcription minutes / month" },
                { t: "pro", text: "Full transcript saved after every session" },
                { t: "pro", text: "AI summary — key moments, action items" },
                { t: "pro", text: "Complete session history" },
                { t: "pro", text: "Early adopter status + exclusive launch bonus" },
              ].map(f => (
                <div className="plan-feature" key={f.text}><FC type={f.t as any} /><span>{f.text}</span></div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.15)", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
              No payment now · billing starts post-alpha · 30 days notice
            </div>
            <ProCTA currentTier={currentTier} />
          </div>

          {/* Contact / Power */}
          <div className="plan-card pc-contact">
            <span className="plan-badge bcontact"><Mail size={9} /> Contact</span>
            <div className="plan-name">Power</div>
            <div className="plan-desc">More minutes, custom data needs, compliance requirements, or something we haven't thought of yet.</div>
            <div className="plan-price-row">
              <div className="plan-price" style={{ fontSize: 32, color: "var(--amber-l)" }}>Let's talk</div>
            </div>
            <div className="plan-features">
              {[
                { t: "yes",  text: "Everything in Pro" },
                { t: "amber", text: "Higher transcription limits" },
                { t: "amber", text: "Custom data retention options" },
                { t: "amber", text: "Privacy & compliance needs" },
                { t: "amber", text: "Volume pricing" },
                { t: "amber", text: "Priority support" },
              ].map(f => (
                <div className="plan-feature" key={f.text}><FC type={f.t as any} /><span>{f.text}</span></div>
              ))}
            </div>
            <a href="mailto:theqntbr@gmail.com" style={{ marginTop: 32 }}>
              <button className="plan-cta ccontact">
                <Mail size={13} /> theqntbr@gmail.com
              </button>
            </a>
          </div>

        </div>

        {/* Why */}
        <div className="why-section">
          <div className="why-header">
            <div className="section-eyebrow">Why it's worth it</div>
            <div className="section-title">Built different</div>
          </div>
          <div className="why-grid">
            {[
              { icon: <Zap size={22} strokeWidth={1.6} />, title: "The call is the product", desc: "Most transcription tools bolt onto Zoom as a bot. qlave is the call. No integrations, no bots, no waiting for a recording to process. Your transcript is ready the moment your session ends." },
              { icon: <Brain size={22} strokeWidth={1.6} />, title: "Your sessions get smarter", desc: "AI summaries surface key moments, decisions, and action items automatically. After ten sessions you have a searchable history of every campaign decision, every jam session idea, every meeting outcome." },
              { icon: <Lock size={22} strokeWidth={1.6} />, title: "P2P by design", desc: "Video and audio travel directly between browsers — the server never sees a frame. qlave only touches audio during transcription, and only on paid plans. Your calls are yours." },
              { icon: <FileText size={22} strokeWidth={1.6} />, title: "Trial minutes, not daily caps", desc: "You get 30 lifetime trial minutes split across your room participants. It's enough to feel the transcription working in a real session — not an artificial drip." },
              { icon: <Users size={22} strokeWidth={1.6} />, title: "Zero friction to join", desc: "The person you invite doesn't need an account. They click the link, allow camera, and they're in. No app install, no signup, no 'you need to download X first'." },
              { icon: <Sparkles size={22} strokeWidth={1.6} />, title: "Early adopter pricing", desc: "The $96 year-one price won't last. AI costs move and standard pricing will follow. Sign up during alpha, pay upfront at launch, and lock in your rate — plus get early adopter status and a launch bonus." },
            ].map(w => (
              <div className="why-card" key={w.title}>
                <div className="why-icon">{w.icon}</div>
                <div className="why-title">{w.title}</div>
                <div className="why-desc">{w.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="faq-section">
          <div className="faq-title">Questions</div>
          <div className="faq-grid">
            {[
              { q: "Do guests need an account?", a: "No. Anyone you share a link with can join without signing up. Only the host needs a qlave account." },
              { q: "How do the 30 trial minutes work?", a: "You get 30 minutes total, shared across everyone speaking in the room. A 6-person call uses those up 6x faster than a solo session. It's enough to feel the transcription in a real call." },
              { q: "What happens when trial minutes run out?", a: "Transcription pauses. Calls keep going — we never cut the connection. Want more trial minutes? Email us. Early users can get bumped to 60." },
              { q: "When does billing start?", a: "Not yet — we're in alpha. When billing goes live, you'll get at least 30 days notice. Early bird pricing ($96 upfront for year one at $8/mo) is available to alpha sign-ups." },
              { q: "Is the $8/mo price locked forever?", a: "It's locked for year one. After that, pricing will likely rise as AI infrastructure costs scale — but early adopters get ongoing loyalty treatment, bonuses, and will always be prioritized." },
              { q: "What if I need more than 600 minutes or have custom requirements?", a: "Email theqntbr@gmail.com. Power usage, compliance needs, custom data retention, volume pricing — all handled directly." },
            ].map(f => (
              <div className="faq-item" key={f.q}>
                <div className="faq-q">{f.q}</div>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA strip */}
        <div className="cta-strip">
          <CtaStrip currentTier={currentTier} />
        </div>

      </div>

      <footer>
        <span className="footer-brand">
          <Drum size={13} strokeWidth={2.5} /> qlave —{" "}
          <a href="https://qntbr.com" style={{ color: "var(--text-2)", marginLeft: 4 }}>qntbr</a>
        </span>
        <div className="footer-links">
          <a href="/">Home</a>
          <a href="/changelog">Changelog</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </div>
      </footer>
    </>
  );
}