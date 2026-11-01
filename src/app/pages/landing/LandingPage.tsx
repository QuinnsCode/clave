"use client";
// src/app/pages/landing/LandingPage.tsx
import { useEffect, useState } from "react";
import { Drum, Zap, Link, Code, Users, Mic, Mail, Video, Settings } from "lucide-react";
import MailTo from "@/app/components/MailTo/MailTo";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: #0a0812;
    color: #e8e2f0;
    -webkit-font-smoothing: antialiased;
  }
  a { text-decoration: none; color: inherit; }
  button { font-family: inherit; cursor: pointer; border: none; }

  :root {
    --purple:   #5b2d8a;
    --purple-l: #8b6aac;
    --purple-g: rgba(91,45,138,0.30);
    --amber:    #b85a14;
    --amber-l:  #c4621a;
    --amber-g:  rgba(184,90,20,0.18);
    --bg:       #0a0812;
    --bg-2:     #0e0b18;
    --bg-3:     #130f1f;
    --border:   rgba(255,255,255,0.05);
    --border-p: rgba(91,45,138,0.22);
    --border-a: rgba(184,90,20,0.22);
    --text:     #e8e2f0;
    --text-2:   #7d7494;
    --text-3:   #3d3550;
    --tribal:   'Josefin Sans', sans-serif;
    --mono:     'DM Mono', monospace;
  }

  /* ── Nav ── */
  nav {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 52px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
    background: rgba(10,8,18,0.90);
    backdrop-filter: blur(28px);
  }
  .pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 18px; border-radius: 100px;
    background: linear-gradient(135deg, #2e1650, #5b2d8a, #6e3fa0);
    font-family: var(--tribal);
    font-size: 12px; font-weight: 700;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: #fff; box-shadow: 0 2px 18px var(--purple-g);
  }
  .nav-links { display: flex; align-items: center; gap: 6px; }
  .btn-ghost {
    padding: 9px 18px; border-radius: 8px;
    font-family: var(--tribal); font-size: 11px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    background: transparent; color: var(--text-2); transition: all 0.15s;
  }
  .btn-ghost:hover { color: var(--text); background: rgba(255,255,255,0.05); }
  .btn-primary {
    padding: 10px 24px; border-radius: 9px;
    font-family: var(--tribal); font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    background: var(--purple); color: #fff;
    box-shadow: 0 2px 18px var(--purple-g); transition: all 0.15s;
  }
  .btn-primary:hover { background: #4a2070; transform: translateY(-1px); }
  .btn-outline {
    padding: 15px 40px; border-radius: 11px;
    font-family: var(--tribal); font-size: 12px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    background: transparent; color: var(--text);
    border: 1px solid var(--border-p); transition: all 0.15s;
  }
  .btn-outline:hover { background: rgba(91,45,138,0.08); }
  .btn-amber {
    padding: 15px 40px; border-radius: 11px;
    font-family: var(--tribal); font-size: 12px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    background: linear-gradient(135deg, var(--amber), var(--amber-l));
    color: #fff; border: none; cursor: pointer;
    box-shadow: 0 2px 24px var(--amber-g); transition: all 0.15s;
  }
  .btn-amber:hover { transform: translateY(-1px); box-shadow: 0 4px 32px rgba(184,90,20,0.32); }

  /* ── Hero ── */
  .hero {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 110px 24px 80px;
    text-align: center; position: relative; overflow: hidden;
  }
  .hero::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 55% at 50% -10%, rgba(91,45,138,0.14) 0%, transparent 65%),
      radial-gradient(ellipse 40% 40% at 5% 95%, rgba(184,90,20,0.08) 0%, transparent 55%),
      radial-gradient(ellipse 30% 40% at 95% 85%, rgba(91,45,138,0.06) 0%, transparent 55%);
  }
  .hero-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 5px 16px; border-radius: 100px;
    border: 1px solid var(--border-a);
    background: rgba(184,90,20,0.06);
    font-family: var(--mono); font-size: 10px;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--amber-l); margin-bottom: 28px;
    position: relative; z-index: 1;
  }
  .hero-badge-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--amber-l); box-shadow: 0 0 6px var(--amber-l);
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }

  .hero-title {
    font-family: var(--tribal);
    font-size: clamp(44px, 7.5vw, 88px);
    font-weight: 700; line-height: 1.06;
    letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--text); max-width: 820px;
    margin-bottom: 10px; position: relative; z-index: 1;
  }
  .hero-title em { font-style: normal; color: var(--amber-l); }
  .hero-sub {
    font-size: 17px; line-height: 1.8; color: var(--text-2);
    max-width: 480px; letter-spacing: 0.01em;
    margin-bottom: 8px; position: relative; z-index: 1;
  }
  .hero-aside {
    font-family: var(--mono); font-size: 11px;
    color: var(--text-3); letter-spacing: 0.1em;
    margin-bottom: 48px; position: relative; z-index: 1;
  }
  .hero-cta {
    display: flex; gap: 12px; flex-wrap: wrap;
    justify-content: center; margin-bottom: 56px;
    position: relative; z-index: 1;
  }

  /* ── Link demo ── */
  .link-demo {
    display: flex; align-items: center;
    background: var(--bg-3);
    border: 1px solid var(--border-a);
    border-radius: 12px; overflow: hidden;
    max-width: 420px; width: 100%;
    position: relative; z-index: 1;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(184,90,20,0.06);
  }
  .link-demo-url {
    flex: 1; padding: 16px 20px;
    font-family: var(--mono); font-size: 14px;
    color: var(--amber-l); letter-spacing: 0.04em;
  }
  .link-demo-url span { color: var(--text-3); }
  .link-demo-btn {
    padding: 16px 22px; border: none; cursor: pointer;
    background: linear-gradient(135deg, var(--amber), var(--amber-l));
    font-family: var(--tribal); font-size: 10px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: #fff; white-space: nowrap; transition: filter 0.15s;
  }
  .link-demo-btn:hover { filter: brightness(1.1); }

  /* ── Two paths: Create / Join ── */
  .two-paths {
    padding: 88px 52px;
    display: flex; flex-direction: column; align-items: center;
    border-top: 1px solid var(--border);
  }
  .paths-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 20px; max-width: 900px; width: 100%;
  }
  .path-card {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 16px; padding: 40px 36px;
    display: flex; flex-direction: column; gap: 16px;
    transition: border-color 0.2s; position: relative; overflow: hidden;
  }
  .path-card::before {
    content: ''; position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
  }
  .path-card.hosted::before { background: linear-gradient(90deg, var(--amber), var(--amber-l)); }
  .path-card.embed::before  { background: linear-gradient(90deg, var(--purple), var(--purple-l)); }
  .path-card.hosted:hover { border-color: var(--border-a); }
  .path-card.embed:hover  { border-color: var(--border-p); }

  .path-tag {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--tribal); font-size: 9px; font-weight: 700;
    letter-spacing: 0.18em; text-transform: uppercase;
    padding: 4px 12px; border-radius: 100px; width: fit-content;
  }
  .path-tag.hosted { background: rgba(184,90,20,0.12); color: var(--amber-l); border: 1px solid var(--border-a); }
  .path-tag.embed  { background: rgba(91,45,138,0.10);  color: var(--purple-l); border: 1px solid var(--border-p); }

  .path-title {
    font-family: var(--tribal); font-size: 20px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--text);
  }
  .path-desc { font-size: 14px; line-height: 1.75; color: var(--text-2); }

  /* ── Flow steps ── */
  .flow-steps { display: flex; flex-direction: column; gap: 0; margin-top: 8px; }
  .flow-step {
    display: flex; align-items: flex-start; gap: 14px;
    position: relative;
  }
  .flow-step:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 13px; top: 28px;
    width: 1px; height: calc(100% + 2px);
    background: var(--border);
  }
  .flow-step-num {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 10px; font-weight: 500;
    flex-shrink: 0; margin-top: 2px; position: relative; z-index: 1;
  }
  .hosted .flow-step-num {
    background: rgba(184,90,20,0.12);
    border: 1px solid var(--border-a);
    color: var(--amber-l);
  }
  .embed .flow-step-num {
    background: rgba(91,45,138,0.10);
    border: 1px solid var(--border-p);
    color: var(--purple-l);
  }
  .flow-step-content { padding-bottom: 20px; }
  .flow-step-label {
    font-family: var(--tribal); font-size: 12px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 3px;
  }
  .hosted .flow-step-label { color: var(--amber-l); }
  .embed .flow-step-label { color: var(--purple-l); }
  .flow-step-desc { font-size: 13px; line-height: 1.6; color: var(--text-2); }

  /* ── Features grid ── */
  .features {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 1px; background: var(--border);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .feature { background: var(--bg); padding: 48px 40px; transition: background 0.2s; }
  .feature:hover { background: var(--bg-2); }
  .feature-icon { color: var(--amber-l); margin-bottom: 20px; }
  .feature-title {
    font-family: var(--tribal); font-size: 12px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--text); margin-bottom: 12px;
  }
  .feature-desc { font-size: 14px; line-height: 1.7; color: var(--text-2); }

  /* ── Transcription explainer ── */
  .transcription-section {
    padding: 80px 52px;
    display: flex; flex-direction: column; align-items: center;
    border-top: 1px solid var(--border);
  }
  .section-eyebrow {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--text-3); margin-bottom: 14px;
    text-align: center;
  }
  .section-title {
    font-family: var(--tribal); font-size: 32px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    text-align: center; color: var(--text); margin-bottom: 16px;
  }
  .section-sub {
    font-size: 15px; line-height: 1.75; color: var(--text-2);
    max-width: 520px; text-align: center; margin-bottom: 52px;
  }
  .transcription-math {
    display: flex; align-items: center; gap: 20px;
    flex-wrap: wrap; justify-content: center;
    margin-bottom: 40px;
  }
  .math-block {
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 14px; padding: 28px 32px;
    text-align: center; min-width: 140px;
  }
  .math-block.highlight {
    border-color: var(--border-a);
    background: rgba(184,90,20,0.05);
  }
  .math-value {
    font-family: var(--tribal); font-size: 36px; font-weight: 700;
    color: var(--amber-l); letter-spacing: 0.04em;
    display: block; margin-bottom: 6px;
  }
  .math-value.purple { color: var(--purple-l); }
  .math-label {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--text-3);
  }
  .math-op {
    font-family: var(--tribal); font-size: 28px; color: var(--text-3);
    font-weight: 300;
  }
  .transcription-note {
    font-family: var(--mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.08em; text-align: center; max-width: 440px;
    line-height: 1.7;
  }

  /* ── Early bird strip ── */
  .early-bird {
    padding: 72px 52px;
    display: flex; flex-direction: column; align-items: center;
    border-top: 1px solid var(--border);
    position: relative; overflow: hidden;
  }
  .early-bird::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 60% 80% at 50% 50%, rgba(184,90,20,0.05) 0%, transparent 70%);
  }
  .early-bird-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 4px 14px; border-radius: 100px;
    border: 1px solid var(--border-a);
    background: rgba(184,90,20,0.06);
    font-family: var(--mono); font-size: 10px;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--amber-l); margin-bottom: 20px;
    position: relative; z-index: 1;
  }
  .early-bird-title {
    font-family: var(--tribal); font-size: clamp(28px, 4vw, 44px);
    font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text); text-align: center; max-width: 600px;
    margin-bottom: 12px; position: relative; z-index: 1;
  }
  .early-bird-title em { font-style: normal; color: var(--amber-l); }
  .early-bird-sub {
    font-size: 15px; line-height: 1.75; color: var(--text-2);
    max-width: 480px; text-align: center;
    margin-bottom: 12px; position: relative; z-index: 1;
  }
  .early-bird-pricing {
    display: flex; align-items: baseline; gap: 10px;
    margin-bottom: 8px; position: relative; z-index: 1;
  }
  .early-bird-price {
    font-family: var(--tribal); font-size: 52px; font-weight: 700;
    color: var(--amber-l); letter-spacing: 0.02em;
  }
  .early-bird-price-note {
    font-family: var(--mono); font-size: 12px; color: var(--text-3);
    letter-spacing: 0.1em;
  }
  .early-bird-future {
    font-family: var(--mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.08em; margin-bottom: 32px;
    position: relative; z-index: 1; text-align: center;
  }
  .early-bird-bonus {
    background: var(--bg-2); border: 1px solid var(--border-a);
    border-radius: 10px; padding: 14px 24px;
    font-family: var(--mono); font-size: 11px; color: var(--amber-l);
    letter-spacing: 0.08em; margin-bottom: 32px;
    position: relative; z-index: 1; text-align: center;
  }
  .early-bird-note {
    font-family: var(--mono); font-size: 10px; color: #6e6888;
    letter-spacing: 0.08em; text-align: center; max-width: 380px;
    line-height: 1.7; position: relative; z-index: 1;
  }

  /* ── Coming soon ── */
  .coming-soon {
    padding: 64px 52px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; align-items: center;
  }
  .coming-soon-grid {
    display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
    max-width: 700px; margin-top: 32px;
  }
  .coming-soon-chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px; border-radius: 100px;
    border: 1px solid rgba(91,45,138,0.35);
    background: rgba(91,45,138,0.08);
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em;
    color: #a89fc4;
  }
  .coming-soon-chip-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--purple-l); opacity: 0.8;
  }

  /* ── Contact strip ── */
  .contact-strip {
    padding: 64px 52px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; align-items: center;
    background: var(--bg-2);
  }
  .contact-strip-title {
    font-family: var(--tribal); font-size: 22px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--text); margin-bottom: 10px; text-align: center;
  }
  .contact-strip-sub {
    font-size: 14px; line-height: 1.75; color: var(--text-2);
    max-width: 480px; text-align: center; margin-bottom: 28px;
  }
  .contact-tags {
    display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
    margin-bottom: 28px;
  }
  .contact-tag {
    padding: 5px 14px; border-radius: 100px;
    border: 1px solid var(--border);
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--text-3);
  }
  .btn-contact {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 28px; border-radius: 10px;
    border: 1px solid var(--border-p);
    background: transparent; color: var(--purple-l);
    font-family: var(--tribal); font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    cursor: pointer; transition: all 0.15s;
  }
  .btn-contact:hover { background: rgba(91,45,138,0.08); }

  /* ── Footer ── */
  footer {
    padding: 28px 52px;
    border-top: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .footer-brand {
    font-family: var(--tribal); font-size: 11px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase;
    display: flex; align-items: center; gap: 8px; color: var(--text-3);
  }
  .footer-links { display: flex; gap: 24px; }
  .footer-links a {
    font-family: var(--tribal); font-size: 10px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-3); transition: color 0.15s;
  }
  .footer-links a:hover { color: var(--text-2); }

  @media (max-width: 768px) {
    nav { padding: 14px 20px; }
    .hero { padding: 72px 20px 60px; }
    .two-paths, .transcription-section, .early-bird, .coming-soon, .contact-strip { padding: 56px 20px; }
    .paths-grid { grid-template-columns: 1fr; }
    .features { grid-template-columns: 1fr; }
    footer { flex-direction: column; gap: 16px; text-align: center; }
    .transcription-math { gap: 12px; }
    .math-op { font-size: 20px; }
  }
`;

const ROOM_CODES = [
  "4eh-y3cbx4w",
  "9mz-k2pqr7t",
  "3xb-f8nwj5v",
  "7qd-h4tce1m",
  "2ys-r6lgk9a",
  "5kp-w1vbz8n",
  "8fc-d3mxj2q",
  "1nt-g7ahu4e",
  "6wj-s5yzp3r",
  "0rv-c9bqt6l",
  "b2tf-m8wxq1",
  "p7nk-r4hze6",
  "j3qy-v9cbu2",
  "w5am-d1ltx8",
  "h6rs-n0gjf4",
  "x9bv-k7pyw3",
  "c4dl-z2mqe5",
  "u1fh-t6nak9",
  "e8pw-b3vcs7",
  "m0xj-g5rty2",
  "a7zn-q4hbl6",
  "r3ck-w8dmf1",
  "t2yp-e6vjx9",
  "n9us-h1abq4",
  "v5gj-l3wnz7",
  "f4bm-x7rke0",
  "k6qt-c2psh8",
  "d8wy-u5fzn3",
  "s1xr-b9tgj6",
  "z7lh-m4cev2",
  "q0np-a8ydw5",
  "g3vf-j6rkb1",
  "y2mc-t1xzh9",
  "l9dk-n7wqs4",
  "o5br-e3pfu8",
  "i4zt-g0ycx6",
  "w8jn-v5lbm2",
  "h1qs-r9dak7",
  "c7ux-f2ntw3",
  "p6ey-k4zjb0",
  "b3mw-s8vhq5",
  "x1fg-u7cpn9",
  "e9tk-d4lzr2",
  "a5rh-j3bwm6",
  "n2vy-o6xft1",
  "t8cj-q1gpk4",
  "m4bl-h9esz7",
  "r6xw-c5nuj3",
  "u0dp-y8mqa8",
  "j7kz-v2fbt5",
];

function LinkDemo() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex(i => (i + 1) % ROOM_CODES.length);
        setFading(false);
      }, 300);
    }, 2700);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="link-demo">
      <div className="link-demo-url">
        <span>qlave.dev/s/</span>
        <span style={{ transition: "opacity 0.3s", opacity: fading ? 0 : 1 }}>
          {ROOM_CODES[index]}
        </span>
      </div>
      <button className="link-demo-btn">Join room →</button>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <nav>
        <a href="/"><span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span></a>
        <div className="nav-links">
          <a href="/user/login"><button className="btn-ghost">Sign in</button></a>
          <a href="/user/signup"><button className="btn-primary">Start free trial</button></a>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Free trial · no credit card required
          </div>

          <h1 className="hero-title">
            A room link<br />in <em>seconds.</em>
          </h1>
          <p className="hero-sub">
            Create a room, pick your settings, share the link. Anyone clicks and they&apos;re in — no app, no account, no friction.
          </p>
          <p className="hero-aside">// built for commander night, useful everywhere</p>

          <div className="hero-cta">
            <a href="/user/signup"><button className="btn-amber">Create your free room</button></a>
            <a href="/user/login"><button className="btn-outline">Sign in</button></a>
          </div>

          <LinkDemo />
        </section>

        {/* How it works — Create / Join */}
        <section className="two-paths">
          <div className="section-eyebrow">How it works</div>
          <h2 className="section-title">Two steps. That&apos;s it.</h2>

          <div className="paths-grid">
            {/* Create a room */}
            <div className="path-card hosted">
              <span className="path-tag hosted"><Settings size={10} /> Create a room</span>
              <div className="path-title">Get your link</div>
              <div className="path-desc">
                Sign up for a free trial, hit create, pick your options, and copy your link. Send it wherever — Discord, iMessage, email, anywhere.
              </div>
              <div className="flow-steps">
                {[
                  { label: "Create room", desc: "One click from your dashboard" },
                  { label: "Pick your settings", desc: "Enable live transcription, add storage — whatever you need" },
                  { label: "Copy & share the link", desc: "Send it to whoever needs to join — no account required on their end" },
                ].map((step, i) => (
                  <div className="flow-step" key={step.label}>
                    <div className="flow-step-num">{i + 1}</div>
                    <div className="flow-step-content">
                      <div className="flow-step-label">{step.label}</div>
                      <div className="flow-step-desc">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Join a room */}
            <div className="path-card embed">
              <span className="path-tag embed"><Link size={10} /> Join a room</span>
              <div className="path-title">Click. Check. Talk.</div>
              <div className="path-desc">
                Got a link? Click it and you land in a green room — check yourself out on camera, get your mic sorted, then join when you&apos;re ready.
              </div>
              <div className="flow-steps">
                {[
                  { label: "Click the link", desc: "No account, no app, no download" },
                  { label: "Green room", desc: "See yourself on camera, check your mic — make sure you look good before anyone else sees you" },
                  { label: "Join the session", desc: "Click join and you're live, with all room options active" },
                ].map((step, i) => (
                  <div className="flow-step" key={step.label}>
                    <div className="flow-step-num">{i + 1}</div>
                    <div className="flow-step-content">
                      <div className="flow-step-label">{step.label}</div>
                      <div className="flow-step-desc">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <div className="features">
          {[
            {
              icon: <Users size={24} strokeWidth={1.6} />,
              title: "Zero friction to join",
              desc: "The person you share with doesn't need an account. They click the link, check their setup in the prep room, and they're in. That's it.",
            },
            {
              icon: <Zap size={24} strokeWidth={1.6} />,
              title: "Peer-to-peer calls",
              desc: "Video and audio travel directly between browsers — fast, private, and free. No server in the middle.",
            },
            {
              icon: <Mic size={24} strokeWidth={1.6} />,
              title: "Live transcription",
              desc: "Enable transcription when you create the room. Trial includes 30 shared minutes — smaller rooms go further.",
            },
            {
              icon: <Video size={24} strokeWidth={1.6} />,
              title: "Session storage",
              desc: "Need a recording? Add storage as a room option when you create the room. Available now as a trial add-on.",
            },
            {
              icon: <Link size={24} strokeWidth={1.6} />,
              title: "Persistent room links",
              desc: "Your room link doesn't expire. Share it once, reuse it forever — for recurring calls or standing invites.",
            },
            {
              icon: <Code size={24} strokeWidth={1.6} />,
              title: "Session dashboard",
              desc: "Every room gets a live session panel — see who's in, what's active, and manage your options without leaving the call.",
            },
          ].map(f => (
            <div className="feature" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Transcription explainer */}
        <section className="transcription-section">
          <div className="section-eyebrow">Live transcription · trial included</div>
          <h2 className="section-title">30 minutes, shared by the room</h2>
          <p className="section-sub">
            Your trial includes 30 minutes of live transcription. Those minutes are split across everyone speaking — so the more people in the room, the faster they go.
          </p>

          <div className="transcription-math">
            <div className="math-block highlight">
              <span className="math-value">30</span>
              <span className="math-label">trial minutes</span>
            </div>
            <span className="math-op">÷</span>
            <div className="math-block">
              <span className="math-value purple">6</span>
              <span className="math-label">people in room</span>
            </div>
            <span className="math-op">=</span>
            <div className="math-block highlight">
              <span className="math-value">5</span>
              <span className="math-label">real-time minutes</span>
            </div>
          </div>

          <p className="transcription-note">
            Calls themselves are always free — P2P, no server cost.
            Transcription is the part that costs real money to run.
            Want more trial minutes?{" "}
            <MailTo email="theqntbr@gmail.com">
              <span style={{ color: "var(--purple-l)", cursor: "pointer", textDecoration: "underline" }}>
                Send us a note
              </span>
            </MailTo>
            {" "}— first group of users can get bumped to 60.
          </p>
        </section>

        {/* Early bird */}
        <section className="early-bird">
          <div className="early-bird-badge">⚡ Early bird · trial supporters only</div>
          <h2 className="early-bird-title">
            Lock in a year at <em>$8/mo.</em><br />Be early. Stay early.
          </h2>
          <p className="early-bird-sub">
            Start free during the trial period. When billing goes live, early supporters pay $96 upfront — one year at $8/month. You get labeled an early adopter, forever. Bonused and prioritized where we can, for as long as we&apos;re running.
          </p>
          <div className="early-bird-pricing">
            <span className="early-bird-price">$96</span>
            <span className="early-bird-price-note">/ year one · $8/mo effective</span>
          </div>
          <div className="early-bird-future">
            After that? $10/mo for everyone else — just normal birds.<br />
            <span style={{ fontSize: 10, opacity: 0.5 }}>Not even laden ones. African or European, we&apos;re not asking.</span>
          </div>
          <div className="early-bird-bonus">
            ✦ early adopters get an exclusive launch bonus + ongoing loyalty — details at launch
          </div>
          <a href="/user/signup">
            <button className="btn-amber">Start free trial · lock in early bird</button>
          </a>
          <p className="early-bird-note" style={{ marginTop: 20 }}>
            No payment now. No credit card. At least 30 days notice before billing starts.
            Need power usage, higher limits, or custom needs?{" "}
            <MailTo email="theqntbr@gmail.com">
              <span style={{ color: "var(--amber-l)", cursor: "pointer", textDecoration: "underline" }}>
                Contact us.
              </span>
            </MailTo>
          </p>
        </section>

        {/* Coming soon */}
        <section className="coming-soon">
          <div className="section-eyebrow">On the roadmap</div>
          <h2 className="section-title">Coming soon</h2>
          <div className="coming-soon-grid">
            {[
              "Power-user scaling",
              "Compliance options",
              "Extended transcription plans",
              "Private room controls",
              "Embed improvements",
            ].map(item => (
              <div className="coming-soon-chip" key={item}>
                <span className="coming-soon-chip-dot" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* Contact strip */}
        <section className="contact-strip">
          <h2 className="contact-strip-title">Need something more?</h2>
          <p className="contact-strip-sub">
            Custom data needs, privacy requirements, compliance, or just want to talk through what you&apos;re building — reach out directly.
          </p>
          <div className="contact-tags">
            {["Custom data needs", "Privacy requirements", "Compliance", "Power usage", "More minutes"].map(t => (
              <span className="contact-tag" key={t}>{t}</span>
            ))}
          </div>
          <MailTo email="theqntbr@gmail.com">
            <button className="btn-contact">
              <Mail size={14} strokeWidth={2} />
              theqntbr@gmail.com
            </button>
          </MailTo>
        </section>
      </main>

      <footer>
        <span className="footer-brand">
          <Drum size={13} strokeWidth={2.5} /> qlave —{" "}
          <a href="https://qntbr.com" style={{ color: "var(--text-2)", marginLeft: 4 }}>qntbr</a>
        </span>
        <div className="footer-links">
          <a href="/changelog">Changelog</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </div>
      </footer>
    </>
  );
}