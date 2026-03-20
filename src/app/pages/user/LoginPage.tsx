"use client";
// src/app/pages/user/LoginPage.tsx
import { Drum } from "lucide-react";
import { useState } from "react";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'DM Sans', sans-serif; background: #080810; color: #ece8f8; -webkit-font-smoothing: antialiased; }
  a { text-decoration: none; color: inherit; }
  button { font-family: inherit; cursor: pointer; border: none; }
  input { font-family: inherit; }
  input:focus { outline: none; }

  :root {
    --purple:   #7c3aed;
    --purple-l: #a78bfa;
    --purple-g: rgba(124,58,237,0.28);
    --bg:       #080810;
    --bg-2:     #0d0d1a;
    --bg-3:     #111120;
    --border:   rgba(255,255,255,0.06);
    --border-p: rgba(124,58,237,0.25);
    --text:     #ece8f8;
    --text-2:   #918caa;
    --text-3:   #4a4660;
    --serif:    'Instrument Serif', Georgia, serif;
    --mono:     'DM Mono', monospace;
  }

  .auth-wrap {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; position: relative; overflow: hidden;
  }
  .auth-wrap::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,58,237,0.11) 0%, transparent 60%);
  }
  .auth-card {
    width: 100%; max-width: 400px;
    background: var(--bg-2); border: 1px solid var(--border);
    border-radius: 18px; padding: 44px 40px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.55);
    position: relative; z-index: 1;
  }
  .auth-logo { display: flex; justify-content: center; margin-bottom: 10px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 15px; border-radius: 100px;
    background: linear-gradient(135deg, #5b21b6, #7c3aed, #8b5cf6);
    font-size: 14px; font-weight: 600; color: #fff;
    box-shadow: 0 2px 18px var(--purple-g); font-family: var(--serif);
  }
  .auth-title { font-family: var(--serif); font-size: 28px; text-align: center; margin-bottom: 6px; }
  .auth-sub { font-size: 14px; color: var(--text-2); text-align: center; margin-bottom: 32px; }
  .field { margin-bottom: 16px; }
  .field label {
    display: block; font-size: 11px; font-weight: 500; color: var(--text-2);
    margin-bottom: 7px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono);
  }
  .field input {
    width: 100%; padding: 11px 14px;
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 9px; color: var(--text); font-size: 14px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field input:focus { border-color: var(--border-p); box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
  .field input::placeholder { color: var(--text-3); }
  .btn-submit {
    width: 100%; padding: 13px; background: var(--purple); color: #fff;
    border-radius: 10px; font-size: 15px; font-weight: 500;
    box-shadow: 0 2px 20px var(--purple-g); transition: all 0.15s; margin-top: 8px;
  }
  .btn-submit:hover { background: #6d28d9; transform: translateY(-1px); }
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .auth-error {
    background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2);
    border-radius: 8px; padding: 11px 14px; font-size: 13px; color: #f87171; margin-bottom: 18px;
  }
  .auth-switch { text-align: center; margin-top: 22px; font-size: 13px; color: var(--text-2); }
  .auth-switch a { color: var(--purple-l); }
  .auth-switch a:hover { color: #c4b5fd; }
  .back-link {
    position: absolute; top: 20px; left: 24px;
    font-size: 13px; color: var(--text-3);
    display: flex; align-items: center; gap: 6px; z-index: 2;
  }
  .back-link:hover { color: var(--text-2); }
`;

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `Sign in failed (${res.status})`);
      }
      const data = await res.json() as { token?: string };
      if (data.token) {
        try { localStorage.setItem("qlave_session", data.token); } catch { /**/ }
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("return_widget")) {
        window.location.href = "/user/login/widget-success";
      } else {
        const PRIMARY_DOMAIN = "qlave.dev";
        window.location.href = `${window.location.protocol}//${PRIMARY_DOMAIN}/dashboard`;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="auth-wrap">
        <a className="back-link" href="/">← qlave.dev</a>
        <div className="auth-card">
          <div className="auth-logo">
            <a href="/"><span className="pill"><Drum size={18} strokeWidth={2.5} /> qlave</span></a>
          </div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to your qlave account</p>
          {error && <div className="auth-error">{error}</div>}
          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
          <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <div className="auth-switch">
            No account? <a href="/user/signup">Sign up free</a>
          </div>
        </div>
      </div>
    </>
  );
}