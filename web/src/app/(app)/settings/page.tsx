"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";

const LEAGUES = ["Runes of Aldur", "HC Runes of Aldur", "Standard", "Hardcore"];

export default function SettingsPage() {
  const [profile, setProfile] = useState<{
    hasPoeSession: boolean;
    maskedPoeSession?: string | null;
    poeLeague: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null>(null);

  const [poeSessionInput, setPoeSessionInput] = useState("");
  const [league, setLeague] = useState("Runes of Aldur");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSessionInput, setShowSessionInput] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setProfile(d);
        setLeague(d.poeLeague ?? "Runes of Aldur");
      });
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poeLeague: league,
        ...(poeSessionInput ? { poeSessionId: poeSessionInput } : {}),
      }),
    });
    // Refresh profile to reflect new hasPoeSession state
    const updated = await fetch("/api/settings").then(r => r.json());
    setProfile(updated);
    setLeague(updated.poeLeague ?? "Runes of Aldur");
    setPoeSessionInput("");
    setShowSessionInput(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function clearSession() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearPoeSession: true }),
    });
    setProfile(p => p ? { ...p, hasPoeSession: false } : p);
  }

  const card: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 16,
  };

  const label: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    borderRadius: 6,
    fontSize: 14,
    padding: "8px 12px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  if (!profile) {
    return <div style={{ color: "var(--text-disabled)", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 560, color: "var(--text-primary)" }}>

      {/* Profile */}
      <div style={card}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Profile</h2>
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            <Image src={profile.avatarUrl} alt="avatar" width={48} height={48} className="rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold" style={{ background: "var(--bg-elevated)" }}>
              {(profile.displayName ?? profile.email ?? "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold">{profile.displayName}</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{profile.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="ml-auto text-sm px-3 py-1.5 rounded cursor-pointer"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* PoE Account */}
      <div style={card}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Path of Exile Account</h2>

        {/* League */}
        <div className="mb-4">
          <label style={label}>Active League</label>
          <select value={league} onChange={e => setLeague(e.target.value)} style={inputStyle}>
            {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* POESESSID */}
        <div>
          <label style={label}>GGG Session ID (POESESSID)</label>
          {profile.hasPoeSession && !showSessionInput ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>
                <span style={{ color: "var(--status-positive)", fontSize: 12 }}>●</span>
                <span style={{ color: "var(--text-secondary)" }}>{profile.maskedPoeSession ?? "Session configured"}</span>
              </div>
              <button onClick={() => setShowSessionInput(true)} className="text-sm px-3 py-2 rounded cursor-pointer" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent", whiteSpace: "nowrap" }}>
                Update
              </button>
              <button onClick={clearSession} className="text-sm px-3 py-2 rounded cursor-pointer" style={{ border: "1px solid var(--border)", color: "var(--status-negative)", background: "transparent" }}>
                Clear
              </button>
            </div>
          ) : (
            <div>
              <input
                type="password"
                placeholder="Paste your POESESSID cookie value…"
                value={poeSessionInput}
                onChange={e => setPoeSessionInput(e.target.value)}
                style={inputStyle}
                autoComplete="off"
              />
              <p className="mt-2 text-xs" style={{ color: "var(--text-disabled)" }}>
                Find it in Chrome: DevTools → Application → Cookies → pathofexile.com → POESESSID
              </p>
              {showSessionInput && (
                <button onClick={() => setShowSessionInput(false)} className="mt-2 text-xs cursor-pointer" style={{ color: "var(--text-disabled)", background: "none", border: "none" }}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
        style={{ background: saved ? "var(--status-positive)" : "var(--accent)", color: "#fff", border: "none" }}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
      </button>
    </div>
  );
}
