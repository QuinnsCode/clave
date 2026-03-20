"use client";
// app/pages/admin/AdminUpgradeClient.tsx

import { useState, useCallback } from "react";
import { searchUsers, setUserTier } from "@/app/serverActions/admin/manageUser";

type Tier = "free" | "pro" | "creator";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  tier: string;
}

const TIER_COLOR: Record<string, string> = {
  free:    "#555",
  pro:     "#a78bfa",
  creator: "#fb923c",
  founder: "#22c55e",
};

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'DM Sans', monospace; background: #080810; color: #e2e2f0; }

.admin-wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 24px;
}
.admin-eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #444;
  margin-bottom: 8px;
}
.admin-title {
  font-size: 22px;
  font-weight: 600;
  color: #e2e2f0;
  margin-bottom: 32px;
}

.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}
.search-input {
  flex: 1;
  background: #0d0d1a;
  border: 1px solid #1e1e3a;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #e2e2f0;
  font-family: inherit;
}
.search-input:focus { outline: none; border-color: #7c3aed; }
.search-btn {
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.search-btn:hover { background: #6d28d9; }
.search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.user-card {
  background: #0d0d1a;
  border: 1px solid #1e1e3a;
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.user-info { flex: 1; min-width: 0; }
.user-email { font-size: 14px; color: #e2e2f0; font-weight: 500; }
.user-name  { font-size: 12px; color: #666; margin-top: 2px; }
.user-meta  { font-size: 11px; color: #444; margin-top: 4px; }

.tier-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.tier-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tier-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  transition: opacity 0.15s;
}
.tier-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tier-btn-free    { background: rgba(255,255,255,0.05); color: #999; border-color: #222; }
.tier-btn-pro     { background: rgba(167,139,250,0.12); color: #a78bfa; border-color: rgba(167,139,250,0.25); }
.tier-btn-creator { background: rgba(251,146,60,0.12);  color: #fb923c; border-color: rgba(251,146,60,0.25); }
.tier-btn.active  { opacity: 0.4; cursor: default; }

.feedback {
  font-size: 12px;
  margin-top: 4px;
  padding: 4px 8px;
  border-radius: 4px;
}
.feedback-ok  { color: #22c55e; }
.feedback-err { color: #f87171; }

.empty { font-size: 13px; color: #444; text-align: center; padding: 40px; }
`;

export default function AdminUpgradeClient({ adminEmail }: { adminEmail: string }) {
  const [query,    setQuery]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [users,    setUsers]    = useState<UserRow[] | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [setting,  setSetting]  = useState<Record<string, boolean>>({});

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await searchUsers(adminEmail, query.trim());
    setUsers(res.users ?? []);
    setLoading(false);
  }, [query, adminEmail]);

  const grantTier = useCallback(async (userId: string, tier: "free" | "pro" | "creator") => {
    setSetting(s => ({ ...s, [userId]: true }));
    const res = await setUserTier(adminEmail, userId, tier);
    setSetting(s => ({ ...s, [userId]: false }));
    if (res.success) {
      setUsers(prev => prev?.map(u => u.id === userId ? { ...u, tier } : u) ?? null);
      setFeedback(f => ({ ...f, [userId]: `✓ set to ${tier}` }));
    } else {
      setFeedback(f => ({ ...f, [userId]: `✗ ${res.error}` }));
    }
    setTimeout(() => setFeedback(f => { const n = { ...f }; delete n[userId]; return n; }), 3000);
  }, [adminEmail]);

  return (
    <>
      <style>{CSS}</style>
      <div className="admin-wrap">
        <div className="admin-eyebrow">Admin</div>
        <div className="admin-title">Upgrade accounts</div>

        <div className="search-row">
          <input
            className="search-input"
            placeholder="Search by email or name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
          />
          <button className="search-btn" onClick={search} disabled={loading}>
            {loading ? "..." : "Search"}
          </button>
        </div>

        {users === null && (
          <div className="empty">Search for a user to get started</div>
        )}

        {users !== null && users.length === 0 && (
          <div className="empty">No users found</div>
        )}

        {users?.map(u => (
          <div key={u.id} className="user-card">
            <div className="user-info">
              <div className="user-email">{u.email}</div>
              {u.name && <div className="user-name">{u.name}</div>}
              <div className="user-meta">
                joined {new Date(u.createdAt).toLocaleDateString()} · {u.id.slice(0, 8)}
              </div>
              {feedback[u.id] && (
                <div className={`feedback ${feedback[u.id].startsWith("✓") ? "feedback-ok" : "feedback-err"}`}>
                  {feedback[u.id]}
                </div>
              )}
            </div>

            <span className="tier-badge" style={{ color: TIER_COLOR[u.tier] ?? "#555" }}>
              {u.tier}
            </span>

            <div className="tier-actions">
              {(["free", "pro", "creator"] as const).map(tier => (
                <button
                  key={tier}
                  className={`tier-btn tier-btn-${tier}${u.tier === tier ? " active" : ""}`}
                  disabled={u.tier === tier || setting[u.id]}
                  onClick={() => grantTier(u.id, tier)}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}