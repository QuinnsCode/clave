"use client";
// src/app/pages/user/SignupPage.tsx

import { useState, useEffect, useRef } from "react";
import { Drum } from "lucide-react";

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
    width: 100%; max-width: 420px;
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
  .section-label {
    font-size: 10px; font-weight: 600; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.08em;
    font-family: var(--mono); margin: 24px 0 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .field { margin-bottom: 14px; }
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
  .field input.error { border-color: rgba(248,113,113,0.4); }
  .field input.ok { border-color: rgba(34,197,94,0.4); }
  .field-hint {
    font-size: 11px; color: var(--text-3); margin-top: 5px;
    font-family: var(--mono); display: flex; align-items: center; gap: 6px;
  }
  .field-hint.error { color: #f87171; }
  .field-hint.ok    { color: #4ade80; }
  .slug-preview { color: var(--purple-l); }
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
  .google-btn {
    width: 100%; padding: 11px 14px; margin-bottom: 20px;
    background: var(--bg-3); border: 1px solid var(--border);
    border-radius: 9px; color: var(--text); font-size: 14px; font-weight: 500;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: border-color 0.15s;
  }
  .google-btn:hover { border-color: var(--border-p); }
  .divider {
    display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
    color: var(--text-3); font-size: 12px;
  }
  .divider::before, .divider::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }
`;

// Slug validation — lowercase letters, numbers, hyphens, 3-30 chars
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

export default function SignupPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [orgName, setOrgName]   = useState("");
  const [slug, setSlug]         = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // Auto-generate slug from org name
  useEffect(() => {
    if (!orgName) return;
    const auto = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    setSlug(auto);
  }, [orgName]);

  // Check slug availability — debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!slug) { setSlugStatus("idle"); return; }
    if (!SLUG_RE.test(slug)) { setSlugStatus("invalid"); return; }

    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { checkSlug } = await import("@/app/serverActions/orgs/checkSlug");
        const { available } = await checkSlug(slug);
        setSlugStatus(available ? "ok" : "taken");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSlugStatus("idle");
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [slug]);

  const slugHint = () => {
    if (!slug) return null;
    if (slugStatus === "invalid")  return { cls: "error", msg: "3–30 chars, lowercase letters, numbers, hyphens only" };
    if (slugStatus === "checking") return { cls: "",      msg: "Checking…" };
    if (slugStatus === "taken")    return { cls: "error", msg: "Already taken — try another" };
    if (slugStatus === "ok")       return { cls: "ok",    msg: `✓ Available — your workspace: ${slug}.qlave.dev` };
    return null;
  };

  const handleSubmit = async () => {
    setError(null);

    if (!email || !password || !orgName || !slug) { setError("All fields are required."); return; }
    if (password !== confirm)                      { setError("Passwords don't match."); return; }
    if (password.length < 8)                       { setError("Password must be at least 8 characters."); return; }
    if (!SLUG_RE.test(slug))                       { setError("Invalid workspace URL — use lowercase letters, numbers, hyphens (3–30 chars)."); return; }
    if (slugStatus === "taken")                    { setError("That workspace URL is already taken."); return; }
    if (slugStatus !== "ok")                       { setError("Please wait for workspace URL check to complete."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email,
          password,
          name: email.split("@")[0],
        }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `Sign up failed (${res.status})`);
      }
      
      const userData = await res.json() as { user: { id: string } };
      const { createOrgForNewUser } = await import("@/app/serverActions/orgs/createOrgForNewUser");
      await createOrgForNewUser(
        { id: userData.user.id, email, name: email.split("@")[0] },
        orgName,
        slug
      );
      
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next ? decodeURIComponent(next) : "/dashboard";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const hint = slugHint();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="auth-wrap">
        <a className="back-link" href="/">← qlave.dev</a>
        <div className="auth-card">
          <div className="auth-logo">
            <a href="/"><span className="pill"><Drum size={18} strokeWidth={2.5} /> qlave</span></a>
          </div>
          <h1 className="auth-title">Get started today</h1>
          <p className="auth-sub">Collaboration made easy.</p>

          {error && <div className="auth-error">{error}</div>}

          <div className="section-label">Account</div>

          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>

          <div className="section-label">Your Workspace</div>

          <div className="field">
            <label>Workspace name</label>
            <input
              type="text"
              placeholder="Acme Corp"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Workspace URL</label>
            <input
              type="text"
              placeholder="acme-corp"
              value={slug}
              className={slugStatus === "ok" ? "ok" : slugStatus === "taken" || slugStatus === "invalid" ? "error" : ""}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
            {hint && <div className={`field-hint ${hint.cls}`}>{hint.msg}</div>}
            {!hint && slug && <div className="field-hint"><span className="slug-preview">{slug}.qlave.dev</span></div>}
          </div>

          <button className="btn-submit" onClick={handleSubmit} disabled={loading || slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}>
            {loading ? "Creating account…" : "Create account"}
          </button>

          <div className="auth-switch">
            Already have one? <a href="/login">Sign in</a>
          </div>

          <div className="divider" style={{marginTop: '20px'}}>or</div>
          <button className="google-btn" disabled style={{opacity: 0.4, cursor: 'not-allowed', marginBottom: 0}}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Google sign-in — coming soon
          </button>
        </div>
      </div>
    </>
  );
}