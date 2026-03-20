"use client";
// src/app/pages/widgetSuccess/WidgetSuccessPage.tsx
import { CheckCircle, Drum } from "lucide-react";


const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'DM Sans', sans-serif; background: #080810; color: #ece8f8; -webkit-font-smoothing: antialiased; }

  :root {
    --purple:   #7c3aed;
    --purple-l: #a78bfa;
    --purple-g: rgba(124,58,237,0.28);
    --bg:       #080810;
    --bg-2:     #0d0d1a;
    --border:   rgba(255,255,255,0.06);
    --text-2:   #918caa;
    --serif:    'Instrument Serif', Georgia, serif;
  }

  .wrap {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; position: relative; overflow: hidden;
  }
  .wrap::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,58,237,0.11) 0%, transparent 60%);
  }
  .card {
    width: 100%; max-width: 400px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 18px; padding: 52px 40px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.55);
    position: relative; z-index: 1;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
    text-align: center;
  }
  .check {
    width: 56px; height: 56px; border-radius: 50%;
    background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; margin-bottom: 4px;
  }
  .title { font-family: var(--serif); font-size: 26px; }
  .sub { font-size: 14px; color: var(--text-2); line-height: 1.7; max-width: 280px; }
  .btn-close {
    margin-top: 8px; padding: 11px 28px;
    background: var(--purple); color: #fff; border: none;
    border-radius: 10px; font-size: 14px; font-weight: 500;
    cursor: pointer; font-family: inherit;
    box-shadow: 0 2px 16px var(--purple-g);
    transition: background 0.15s, transform 0.15s;
  }
  .btn-close:hover { background: #6d28d9; transform: translateY(-1px); }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 13px; border-radius: 100px;
    background: linear-gradient(135deg, #5b21b6, #7c3aed, #8b5cf6);
    font-size: 13px; font-weight: 600; color: #fff;
    box-shadow: 0 2px 14px var(--purple-g); font-family: var(--serif);
    text-decoration: none; margin-bottom: 8px;
  }
`;

export default function WidgetSuccessPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wrap">
        <div className="card">
          <a href="/"><span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span></a>
          <div className="check"><CheckCircle size={28} color="#22c55e" strokeWidth={1.5} /></div>
          <h1 className="title">You're signed in</h1>
          <p className="sub">
            Head back to the site you came from — the qlave widget will pick up your session automatically.
          </p>
          <button className="btn-close" onClick={() => window.close()}>
            Close this tab
          </button>
        </div>
      </div>
    </>
  );
}