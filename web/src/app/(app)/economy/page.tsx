"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { EconomyData, CurrencyEntry } from "@/app/api/economy/route";

function fmt(value: number): string {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100)  return value.toFixed(1);
  if (value >= 10)   return value.toFixed(2);
  if (value >= 1)    return value.toFixed(2);
  return value.toFixed(3);
}

function PriceTag({ entry }: { entry: CurrencyEntry }) {
  const isDiv = entry.displayCurrency === "divine";
  return (
    <div className="text-right shrink-0">
      <p className="text-sm font-semibold tabular-nums"
        style={{ color: isDiv ? "#FFD700" : "var(--status-positive)" }}>
        {fmt(entry.displayValue)}
        <span className="text-xs font-normal ml-1" style={{ color: "var(--text-disabled)" }}>
          {isDiv ? "div" : "ex"}
        </span>
      </p>
      {isDiv && (
        <p className="text-xs tabular-nums" style={{ color: "var(--text-disabled)" }}>
          {fmt(entry.exaltValue)}x
        </p>
      )}
    </div>
  );
}

function CurrencyRow({ entry }: { entry: CurrencyEntry }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{ background: "var(--bg-elevated)" }}>
      <div className="w-7 h-7 flex items-center justify-center shrink-0">
        {entry.iconUrl ? (
          <Image src={entry.iconUrl} alt={entry.name} width={28} height={28}
            className="object-contain" unoptimized />
        ) : (
          <div className="w-5 h-5 rounded" style={{ background: "var(--bg-surface)" }} />
        )}
      </div>
      <p className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
        {entry.name}
      </p>
      <PriceTag entry={entry} />
    </div>
  );
}

function CategorySection({ label, entries }: { label: string; entries: CurrencyEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);
  if (entries.length === 0) return null;
  return (
    <div className="mb-5">
      <button
        className="flex items-center gap-2 w-full mb-2 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
        style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider flex-1"
          style={{ color: "var(--text-disabled)" }}>
          {label}
        </h2>
        <span className="text-xs" style={{ color: "var(--text-disabled)" }}>
          {collapsed ? "▶" : "▼"}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1">
          {entries.map(e => <CurrencyRow key={e.apiId + e.name} entry={e} />)}
        </div>
      )}
    </div>
  );
}

export default function EconomyPage() {
  const [data, setData]         = useState<EconomyData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/economy");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ color: "var(--text-primary)" }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">Economy</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>
              {data.league} · 1 Divine = {data.divineInExalt.toFixed(1)} Exalts
              {lastRefresh && ` · ${lastRefresh.toLocaleTimeString()}`}
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading}
          className="text-xs px-3 py-1.5 rounded cursor-pointer disabled:opacity-50"
          style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse"
              style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
          {data.categories.map((cat, i) => (
            <div key={cat.id} className={i % 2 === 0 ? "" : ""}>
              <CategorySection label={cat.label} entries={cat.entries} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
