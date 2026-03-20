// src/widget/auth.ts
// Handles session detection and sign-in redirect.
// No auth logic lives here — we delegate entirely to qlave.dev.

const SESSION_KEY = "qlave_session";
const AUTH_URL = "https://qlave.dev/user/login?return_widget=1";

export interface QlaveUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthState {
  user: QlaveUser | null;
  loading: boolean;
}

/** Check if a valid session exists by hitting /api/auth/get-session */
export async function checkSession(): Promise<QlaveUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch("https://qlave.dev/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) {
      clearStoredToken();
      return null;
    }
    const data = await res.json() as { user?: QlaveUser };
    if (!data.user) { clearStoredToken(); return null; }
    return data.user;
  } catch {
    // Network error — don't clear token, just return null
    return null;
  }
}

export function openSignIn(): void {
  window.open(AUTH_URL, "_blank", "noopener,noreferrer");
}

export function getStoredToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function clearStoredToken(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /**/ }
}