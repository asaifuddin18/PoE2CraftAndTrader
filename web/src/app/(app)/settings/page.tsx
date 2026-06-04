"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { isBridgeReady } from "@/lib/trade-bridge";

const LEAGUES = ["Runes of Aldur", "HC Runes of Aldur", "Standard", "Hardcore"];

export default function SettingsPage() {
  const [profile, setProfile] = useState<{
    hasPoeSession: boolean;
    maskedPoeSession?: string | null;
    hasCfClearance: boolean;
    maskedCfClearance?: string | null;
    poeLeague: string;
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null>(null);

  const [poeSessionInput, setPoeSessionInput] = useState("");
  const [cfClearanceInput, setCfClearanceInput] = useState("");
  const [league, setLeague] = useState("Runes of Aldur");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSessionInput, setShowSessionInput] = useState(false);
  const [showCfInput, setShowCfInput] = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);

  useEffect(() => {
    if (isBridgeReady()) setBridgeActive(true);
    const handler = () => setBridgeActive(true);
    window.addEventListener("poe2:bridge-ready", handler);
    return () => window.removeEventListener("poe2:bridge-ready", handler);
  }, []);

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
        ...(poeSessionInput  ? { poeSessionId: poeSessionInput  } : {}),
        ...(cfClearanceInput ? { cfClearance:  cfClearanceInput } : {}),
      }),
    });
    const updated = await fetch("/api/settings").then(r => r.json());
    setProfile(updated);
    setLeague(updated.poeLeague ?? "Runes of Aldur");
    setPoeSessionInput("");
    setCfClearanceInput("");
    setShowSessionInput(false);
    setShowCfInput(false);
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
    setProfile(p => p ? { ...p, hasPoeSession: false, maskedPoeSession: null, hasCfClearance: false, maskedCfClearance: null } : p);
  }

  const card: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 16,
  };
  const label: React.CSSProperties = {
    fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 6, fontSize: 14,
    padding: "8px 12px", width: "100%", outline: "none", boxSizing: "border-box",
  };
  const monoDisplay: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "8px 12px",
    fontFamily: "var(--font-mono, monospace)", fontSize: 13,
    color: "var(--text-secondary)", flex: 1, display: "flex", alignItems: "center", gap: 8,
  };
  const btnSecondary: React.CSSProperties = {
    border: "1px solid var(--border)", color: "var(--text-secondary)",
    background: "transparent", borderRadius: 6, padding: "7px 12px",
    fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
  };

  function CookieRow({ lbl, hasValue, masked, showInput, setShowInput, inputValue, setInputValue, placeholder, hint }: {
    lbl: string; hasValue: boolean; masked?: string | null;
    showInput: boolean; setShowInput: (v: boolean) => void;
    inputValue: string; setInputValue: (v: string) => void;
    placeholder: string; hint: string;
  }) {
    return (
      <div className="mb-4">
        <label style={label}>{lbl}</label>
        {hasValue && !showInput ? (
          <div className="flex items-center gap-2">
            <div style={monoDisplay}>
              <span style={{ color: "var(--status-positive)", fontSize: 11 }}>●</span>
              {masked ?? "Configured"}
            </div>
            <button onClick={() => setShowInput(true)} style={btnSecondary}>Update</button>
          </div>
        ) : (
          <div>
            <input type="password" placeholder={placeholder} value={inputValue}
              onChange={e => setInputValue(e.target.value)} style={inputStyle} autoComplete="off" />
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-disabled)" }}>{hint}</p>
            {showInput && (
              <button onClick={() => setShowInput(false)} className="mt-1 text-xs cursor-pointer"
                style={{ color: "var(--text-disabled)", background: "none", border: "none" }}>Cancel</button>
            )}
          </div>
        )}
      </div>
    );
  }

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
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold"
              style={{ background: "var(--bg-elevated)" }}>
              {(profile.displayName ?? profile.email ?? "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold">{profile.displayName}</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{profile.email}</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/" })} style={{ ...btnSecondary, marginLeft: "auto" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Browser Bridge */}
      <div style={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Browser Bridge
          </h2>
          <span className="text-xs flex items-center gap-1.5" style={{ color: bridgeActive ? "var(--status-positive)" : "var(--status-warning)" }}>
            <span>{bridgeActive ? "●" : "○"}</span>
            {bridgeActive ? "Active" : "Not detected"}
          </span>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Trade searches run directly through your browser using a Tampermonkey userscript.
          This routes requests from your own IP with your GGG session — bypassing Cloudflare restrictions that block server-side requests.
        </p>

        {!bridgeActive && (
          <div className="rounded-md p-3 mb-4 text-sm" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Setup (one time)</p>
            <ol className="space-y-2" style={{ color: "var(--text-secondary)", paddingLeft: 16, listStyle: "decimal" }}>
              <li>Install the Tampermonkey browser extension</li>
              <li>Click <strong style={{ color: "var(--text-primary)" }}>Install bridge script</strong> below — Tampermonkey will prompt you to confirm</li>
              <li>Reload this page</li>
            </ol>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <a
            href="https://www.tampermonkey.net/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Tampermonkey ↗
          </a>
          <a
            href="/poe2-bridge.user.js"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...btnSecondary,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: bridgeActive ? "transparent" : "var(--accent)",
              borderColor: bridgeActive ? "var(--border)" : "var(--accent)",
              color: bridgeActive ? "var(--text-secondary)" : "#fff",
            }}
          >
            {bridgeActive ? "Reinstall bridge script" : "Install bridge script"} ↗
          </a>
        </div>
      </div>

      {/* PoE Account */}
      <div style={card}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Path of Exile Account
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-disabled)" }}>
          Optional — used as fallback if the browser bridge is unavailable.
          Find both in Chrome: DevTools → Application → Cookies → www.pathofexile.com
        </p>

        <div className="mb-4">
          <label style={label}>Active League</label>
          <select value={league} onChange={e => setLeague(e.target.value)} style={inputStyle}>
            {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <CookieRow
          lbl="POESESSID"
          hasValue={profile.hasPoeSession}
          masked={profile.maskedPoeSession}
          showInput={showSessionInput}
          setShowInput={setShowSessionInput}
          inputValue={poeSessionInput}
          setInputValue={setPoeSessionInput}
          placeholder="Paste POESESSID value…"
          hint="Your GGG session token."
        />
        <CookieRow
          lbl="cf_clearance"
          hasValue={profile.hasCfClearance}
          masked={profile.maskedCfClearance}
          showInput={showCfInput}
          setShowInput={setShowCfInput}
          inputValue={cfClearanceInput}
          setInputValue={setCfClearanceInput}
          placeholder="Paste cf_clearance value…"
          hint="Cloudflare session cookie from pathofexile.com."
        />
        {(profile.hasPoeSession || profile.hasCfClearance) && (
          <button onClick={clearSession} className="text-xs cursor-pointer mt-1"
            style={{ color: "var(--status-negative)", background: "none", border: "none" }}>
            Clear all session cookies
          </button>
        )}
      </div>

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
