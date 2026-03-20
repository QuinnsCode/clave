"use client";
// src/app/pages/pricing/PricingClient.tsx
// Only reactive content — tier banner, hero copy, upgrade spotlight, CTA buttons

import { Check, ArrowRight } from "lucide-react";

export type Tier = "free" | "pro" | "creator" | "founder";

interface TierProps { currentTier: Tier; isLoggedIn?: boolean; }

export function TierBanner({ currentTier, isLoggedIn }: TierProps) {
  if (!isLoggedIn) return null;
  const msg: Record<Tier, string> = {
    free:    "Upgrade to keep your transcripts forever.",
    pro:     "Your $8 rate is locked in forever.",
    creator: "You're on our highest tier.",
    founder: "Founder access — full features, always.",
  };
  return (
    <div className={`tier-banner ${currentTier}`}>
      <div className="tier-banner-left">
        <div className="tier-banner-dot" />
        <div className="tier-banner-label">Current plan: {currentTier}</div>
      </div>
      <div className="tier-banner-msg">{msg[currentTier]}</div>
    </div>
  );
}

export function PricingHero({ currentTier }: { currentTier: Tier }) {
  const copy: Record<Tier, { title: React.ReactNode; sub: string }> = {
    free:    { title: <><em>One upgrade</em> away from keeping everything</>, sub: "You've got the call. Pro adds the memory. Lock in $8/mo before the price goes up." },
    pro:     { title: <>You're already in. <em>Go deeper with Creator</em></>, sub: "Pro saves your sessions. Creator gives you more minutes, better accuracy, and first access to everything we ship." },
    creator: { title: <>You're on our <em>best plan</em></>, sub: "Need something custom? We talk to our users directly. Reach out." },
    founder: { title: <>You're a <em>Founder</em></>, sub: "You have full access, forever. We appreciate you being here early." },
  };
  const { title, sub } = copy[currentTier];
  return (
    <div className="pricing-hero">
      <div className="pricing-eyebrow">Pricing</div>
      <h1 className="pricing-title">{title}</h1>
      <p className="pricing-sub">{sub}</p>
    </div>
  );
}

export function UpgradeSpotlight({ currentTier }: { currentTier: Tier }) {
  if (currentTier === "free") return (
    <div className="upgrade-spotlight to-pro">
      <div className="spot-inner">
        <div className="spot-eyebrow">You're on Free</div>
        <div className="spot-title">Every session you run free<br />is a session <em>you don't get back</em></div>
        <div className="spot-desc">Live captions disappear the moment your session ends. Your DnD lore, your band's ideas, your team's decisions — gone. Pro saves everything, automatically, forever. At $8/mo it's less than a pizza.</div>
        <div className="spot-perks">
          {["Full transcript saved", "AI session summary", "Session history", "600 min/mo", "Locked in forever at $8"].map(p => (
            <div className="spot-perk" key={p}><Check size={11} style={{ color: "var(--purple-l)", flexShrink: 0 }} />{p}</div>
          ))}
        </div>
        <a href="/user/signup"><button className="spot-cta to-pro">Upgrade to Pro — $8/mo <ArrowRight size={14} /></button></a>
      </div>
    </div>
  );

  if (currentTier === "pro") return (
    <div className="upgrade-spotlight to-creator">
      <div className="spot-inner">
        <div className="spot-eyebrow">You're on Pro</div>
        <div className="spot-title">Running longer sessions?<br /><em>Creator has you covered</em></div>
        <div className="spot-desc">Pro gives you 600 transcription minutes a month — plenty for most groups. But if you're streaming, podcasting, or running 4+ hour sessions weekly, Creator's 3,000 minutes and higher-accuracy Nova model are worth it.</div>
        <div className="spot-perks">
          {["3,000 min/mo (5× more)", "Nova accuracy model", "Priority queue", "Extended history", "Early feature access"].map(p => (
            <div className="spot-perk" key={p}><Check size={11} style={{ color: "var(--amber-l)", flexShrink: 0 }} />{p}</div>
          ))}
        </div>
        <a href="/user/signup"><button className="spot-cta to-creator">Upgrade to Creator — $20/mo <ArrowRight size={14} /></button></a>
      </div>
    </div>
  );

  return (
    <div className="upgrade-spotlight to-contact">
      <div className="spot-inner">
        <div className="spot-eyebrow">{currentTier === "founder" ? "You're a Founder" : "You're on Creator"}</div>
        <div className="spot-title">{currentTier === "founder" ? "You're already on the best plan" : "You're on our highest tier"}</div>
        <div className="spot-desc">Need something custom? Higher limits, team access, API integration, or a white-label setup? We're a small team and we talk to our users directly. Reach out and we'll figure it out.</div>
        <a href="mailto:theqntbr@gmail.com"><button className="spot-cta to-contact">Contact us — theqntbr@gmail.com <ArrowRight size={14} /></button></a>
      </div>
    </div>
  );
}

export function CurrentTag({ tier, currentTier }: { tier: Tier; currentTier: Tier }) {
  if (tier !== currentTier) return null;
  return <div className="current-tag">current</div>;
}

export function FreeCTA({ currentTier }: { currentTier: Tier }) {
  if (currentTier === "free") return <button className="plan-cta ccurrent" disabled>Your current plan</button>;
  return <a href="/user/signup"><button className="plan-cta cfree">Start free</button></a>;
}

export function ProCTA({ currentTier }: { currentTier: Tier }) {
  if (currentTier === "pro") return <button className="plan-cta ccurrent" disabled>Your current plan</button>;
  return <a href="/user/signup"><button className="plan-cta cpro">Lock in $8 / mo →</button></a>;
}

export function CreatorCTA({ currentTier }: { currentTier: Tier }) {
  if (currentTier === "creator") return <button className="plan-cta ccurrent" disabled>Your current plan</button>;
  return <a href="/user/signup"><button className="plan-cta ccreator">Get Creator →</button></a>;
}

export function CtaStrip({ currentTier }: { currentTier: Tier }) {
  if (currentTier === "free") return (
    <>
      <div className="cta-strip-title">Start your first session<br />in 30 seconds</div>
      <div className="cta-strip-sub">Free forever. Upgrade when the transcript saves your campaign.</div>
      <div className="cta-btns">
        <a href="/user/signup"><button className="btn-amber-lg">Get your free room</button></a>
        <a href="/user/login"><button className="btn-outline-lg">Sign in</button></a>
      </div>
    </>
  );
  if (currentTier === "pro") return (
    <>
      <div className="cta-strip-title">Running longer sessions?</div>
      <div className="cta-strip-sub">Creator gives you 5× more minutes and a higher accuracy model.</div>
      <div className="cta-btns">
        <a href="/user/signup"><button className="btn-amber-lg">Upgrade to Creator</button></a>
        <a href="/dashboard"><button className="btn-outline-lg">Back to dashboard</button></a>
      </div>
    </>
  );
  return (
    <>
      <div className="cta-strip-title">Need something custom?</div>
      <div className="cta-strip-sub">Higher limits, team access, API, white-label — reach out directly.</div>
      <div className="cta-btns">
        <a href="mailto:theqntbr@gmail.com"><button className="btn-purple-lg">Contact us</button></a>
        <a href="/dashboard"><button className="btn-outline-lg">Back to dashboard</button></a>
      </div>
    </>
  );
}