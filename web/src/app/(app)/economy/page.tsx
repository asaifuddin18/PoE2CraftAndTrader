"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { EconomyData, CurrencyEntry } from "@/app/api/economy/route";

// Crafting ingredients grouped by purpose
const GROUPS: { label: string; apiIds: string[] }[] = [
  {
    label: "High Value",
    apiIds: ["mirror", "hinekoras-lock", "divine", "fracturing-orb", "perfect-chaos-orb", "perfect-exalted-orb"],
  },
  {
    label: "Core Crafting",
    apiIds: ["exalted", "annul", "chaos", "vaal", "greater-exalted-orb", "greater-chaos-orb", "perfect-regal-orb", "greater-regal-orb", "regal"],
  },
  {
    label: "Magic Crafting",
    apiIds: ["orb-of-chance", "alch", "transmute", "aug", "greater-orb-of-transmutation", "greater-orb-of-augmentation"],
  },
  {
    label: "Quality / Utility",
    apiIds: ["perfect-jewellers-orb", "greater-jewellers-orb", "lesser-jewellers-orb", "gemcutters-prism", "glassblowers-bauble", "armourers-scrap", "blacksmiths-whetstone", "arcanists-etcher", "artificers-orb", "cryptic-key"],
  },
  {
    label: "Shards",
    apiIds: ["chance-shard", "transmutation-shard", "regal-shard", "artificers-shard"],
  },
];

function fmt(value: number, currency: "exalt" | "divine"): string {
  if (value >= 100)  return value.toFixed(0);
  if (value >= 10)   return value.toFixed(1);
  if (value >= 1)    return value.toFixed(2);
  return value.toFixed(3);
}

function PriceTag({ entry }: { entry: CurrencyEntry }) {
  const isDiv = entry.displayCurrency === "divine";
  return (
    <span
      className="text-sm font-semibold tabular-nums"
      style={{ color: isDiv ? "#FFD700" : "var(--status-positive)" }}
    >
      {fmt(entry.displayValue, entry.displayCurrency)}
      <span className="text-xs font-normal ml-1" style={{ color: "var(--text-disabled)" }}>
        {isDiv ? "div" : "ex"}
      </span>
    </span>
  );
}

function CurrencyRow({ entry }: { entry: CurrencyEntry }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
      style={{ background: "var(--bg-elevated)" }}
    >
      <div className="w-8 h-8 flex items-center justify-center shrink-0">
        {entry.iconUrl ? (
          <Image src={entry.iconUrl} alt={entry.name} width={32} height={32} className="object-contain" unoptimized />
        ) : (
          <div className="w-6 h-6 rounded" style={{ background: "var(--bg-surface)" }} />
        )}
      </div>
      <p className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>
        {entry.name}
      </p>
      <div className="text-right shrink-0">
        <PriceTag entry={entry} />
        <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
          {entry.exaltValue.toFixed(2)}x
        </p>
      </div>
    </div>
  );
}

function CurrencyGroup({ label, entries }: { label: string; entries: CurrencyEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-6">
      <h2
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--text-disabled)" }}
      >
        {label}
      </h2>
      <div className="flex flex-col gap-1">
        {entries.map(e => <CurrencyRow key={e.apiId} entry={e} />)}
      </div>
    </div>
  );
}

export default function EconomyPage() {
  const [data, setData]       = useState<EconomyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/economy");
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Build grouped lists
  function getGroup(apiIds: string[]): CurrencyEntry[] {
    if (!data) return [];
    const map = new Map(data.currencies.map(c => [c.apiId, c]));
    return apiIds.flatMap(id => map.get(id) ? [map.get(id)!] : []);
  }

  const groupedApiIds = new Set(GROUPS.flatMap(g => g.apiIds));
  const other = data?.currencies.filter(c => !groupedApiIds.has(c.apiId)) ?? [];

  return (
    <div style={{ color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Economy</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>
              {data.league} · 1 Divine = {data.divineInExalt.toFixed(1)} Exalts
              {lastRefresh && ` · Updated ${lastRefresh.toLocaleTimeString()}`}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded cursor-pointer disabled:opacity-50"
          style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}
        >
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
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
          <div>
            {GROUPS.slice(0, 3).map(g => (
              <CurrencyGroup key={g.label} label={g.label} entries={getGroup(g.apiIds)} />
            ))}
          </div>
          <div>
            {GROUPS.slice(3).map(g => (
              <CurrencyGroup key={g.label} label={g.label} entries={getGroup(g.apiIds)} />
            ))}
            {other.length > 0 && (
              <CurrencyGroup label="Other" entries={other} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
