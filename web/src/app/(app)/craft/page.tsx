"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { SolverResult, ChartPoint } from "@/lib/craft-solver";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetMod {
  modId:    string;
  label:    string;
  affix:    "prefix" | "suffix";
  tier:     number;
  minTier:  number | "";
}

interface IdealItem {
  idealId:    string;
  name:       string;
  classId:    string;
  baseId:     string;
  itemBase:   string;
  ilvl:       number;
  targetMods: TargetMod[];
}

interface ModTier  { tier: number; ilvl: number; weight: number; }
interface ModDef   { modId: string; name: string; affix: string; tiers: ModTier[]; }
interface ItemData { mods: Record<string, ModDef[]> }

let itemDataCache: ItemData | null = null;
async function loadItemData(): Promise<ItemData> {
  if (itemDataCache) return itemDataCache;
  itemDataCache = await fetch("/ideal-item-data.json").then(r => r.json());
  return itemDataCache!;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtProb(p: number): string {
  if (p <= 0)    return "0%";
  if (p < 0.0001) return `${(p * 100).toFixed(4)}%`;
  if (p < 0.01)   return `${(p * 100).toFixed(3)}%`;
  if (p < 0.1)    return `${(p * 100).toFixed(2)}%`;
  return `${(p * 100).toFixed(1)}%`;
}

function fmtCost(v: number, cur: "exalt" | "divine"): string {
  const s = v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${s} ${cur === "divine" ? "div" : "ex"}`;
}

function fmtAttempts(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function CostProbChart({ data, divineInExalt }: { data: ChartPoint[]; divineInExalt: number }) {
  const maxCost  = data[data.length - 1]?.costExalt ?? 1;
  const useDiv   = maxCost >= divineInExalt;
  const divisor  = useDiv ? divineInExalt : 1;
  const curLabel = useDiv ? "div" : "ex";

  const chartData = data.map(d => ({
    cost: +(d.costExalt / divisor).toFixed(2),
    prob: +(d.probability * 100).toFixed(2),
  }));

  const p50 = data.find(d => d.probability >= 0.5);
  const p90 = data.find(d => d.probability >= 0.9);

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "var(--text-disabled)" }}>
        Cost ({curLabel}) vs Cumulative Probability of Success
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="cost"
            tickFormatter={v => `${v}${curLabel}`}
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }} stroke="var(--border)" />
          <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]}
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }} stroke="var(--border)" width={38} />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, "Probability"]}
            labelFormatter={(v: unknown) => `Cost: ${v} ${curLabel}`}
          />
          {p50 && <ReferenceLine x={+(p50.costExalt / divisor).toFixed(2)}
            stroke="var(--status-warning)" strokeDasharray="4 4"
            label={{ value: "50%", fill: "var(--status-warning)", fontSize: 10, position: "top" }} />}
          {p90 && <ReferenceLine x={+(p90.costExalt / divisor).toFixed(2)}
            stroke="var(--status-negative)" strokeDasharray="4 4"
            label={{ value: "90%", fill: "var(--status-negative)", fontSize: 10, position: "top" }} />}
          <Area type="monotone" dataKey="prob" stroke="var(--accent)"
            fill="url(#probGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CraftPage() {
  const [idealItems, setIdealItems] = useState<IdealItem[]>([]);
  const [idealId, setIdealId]       = useState("");
  const [mode, setMode]             = useState<"exact" | "minTier">("minTier");
  const [solving, setSolving]       = useState(false);
  const [result, setResult]         = useState<SolverResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideal-items")
      .then(r => r.json())
      .then(d => {
        const items = (d.idealItems ?? []) as IdealItem[];
        setIdealItems(items);
        // Auto-select first item with mods
        const first = items.find(i => i.targetMods?.length > 0);
        if (first) setIdealId(first.idealId);
      });
  }, []);

  const selected = idealItems.find(i => i.idealId === idealId);

  async function solve() {
    if (!selected || !selected.targetMods?.length) return;
    setSolving(true);
    setError(null);
    setResult(null);

    try {
      // Load mod pool client-side and send to server — avoids filesystem reads on Vercel
      const itemData = await loadItemData();
      const baseMods = itemData.mods[selected.baseId] ?? [];

      if (!baseMods.length) {
        throw new Error(`No mod pool found for base "${selected.itemBase}" (id: ${selected.baseId})`);
      }

      // Filter to eligible mods at the item's ilvl
      const ilvl = selected.ilvl;
      const eligibleMods = baseMods
        .map(m => ({
          ...m,
          tiers: m.tiers.filter(t => t.ilvl <= ilvl && t.weight > 0),
        }))
        .filter(m => m.tiers.length > 0);

      const targetMods = selected.targetMods
        .filter(m => m.modId)
        .map(m => ({
          modId:   m.modId,
          name:    m.label,
          affix:   m.affix,
          tier:    m.tier,
          minTier: Number(m.minTier) || m.tier,
        }));

      const res = await fetch("/api/craft/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseMods: eligibleMods, targetMods, mode, ilvl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSolving(false);
    }
  }

  const sel: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 6, fontSize: 13,
    padding: "7px 10px", width: "100%", outline: "none",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4,
  };

  return (
    <div className="flex gap-6 h-full" style={{ color: "var(--text-primary)" }}>

      {/* Left panel */}
      <aside className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <h2 className="font-semibold text-sm mb-4">Craft Solver</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-disabled)" }}>
          Estimates the probability and cost of Chaos Orb rerolling to hit your ideal item.
        </p>

        {/* Ideal item selector */}
        <div className="mb-4">
          <label style={lbl}>Ideal Item</label>
          {idealItems.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
              No ideal items yet.{" "}
              <a href="/ideal-items" style={{ color: "var(--accent)" }}>Create one →</a>
            </p>
          ) : (
            <select value={idealId} onChange={e => { setIdealId(e.target.value); setResult(null); }} style={sel}>
              <option value="">— select ideal item —</option>
              {idealItems.map(i => (
                <option key={i.idealId} value={i.idealId}
                  disabled={!i.targetMods?.length}>
                  {i.name}{!i.targetMods?.length ? " (no mods)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Summary of selected ideal item */}
        {selected && (
          <div className="rounded-md p-3 mb-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
              {selected.itemBase || selected.classId} · ilvl {selected.ilvl}
            </p>
            {selected.targetMods.filter(m => m.modId).map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 mt-0.5">
                <span style={{ fontSize: 9, color: "var(--text-disabled)" }}>
                  {m.affix === "prefix" ? "P" : "S"}
                </span>
                <p className="text-xs truncate" style={{ color: "var(--status-info)" }}>
                  {m.label}
                  <span style={{ color: "var(--text-disabled)" }}>
                    {" "}T{m.tier}{m.minTier && m.minTier !== m.tier ? `–T${m.minTier}` : ""}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Mode */}
        <div className="mb-5">
          <label style={lbl}>Mode</label>
          <div className="flex flex-col gap-2">
            {(["minTier", "exact"] as const).map(m => (
              <label key={m} className="flex items-start gap-2 cursor-pointer p-2 rounded"
                style={{ background: mode === m ? "var(--bg-elevated)" : "transparent", border: `1px solid ${mode === m ? "var(--accent)" : "transparent"}` }}>
                <input type="radio" name="mode" value={m} checked={mode === m}
                  onChange={() => { setMode(m); setResult(null); }}
                  style={{ marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {m === "exact" ? "Exact tiers" : "Minimum tiers"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                    {m === "exact"
                      ? "Must hit the exact tier specified per mod"
                      : "Any tier up to the minimum acceptable (T1–minTier)"}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button onClick={solve}
          disabled={solving || !idealId || !selected?.targetMods?.filter(m => m.modId).length}
          className="w-full py-2.5 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
          {solving ? "Simulating…" : "Calculate"}
        </button>

        {solving && (
          <p className="text-xs text-center mt-2" style={{ color: "var(--text-disabled)" }}>
            Running 100k simulations…
          </p>
        )}
      </aside>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {error && (
          <div className="rounded-lg p-3 mb-4 text-sm"
            style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
            {error}
          </div>
        )}

        {!result && !error && !solving && (
          <div className="flex flex-col items-center justify-center h-56 text-center">
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Select an ideal item and click Calculate.
            </p>
            <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
              The solver runs 100k Monte Carlo simulations of Chaos Orb rerolling
              to estimate probability and cost.
            </p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Probability / attempt",
                  value: fmtProb(result.probability),
                  sub: result.probability > 0 ? `1 in ${fmtAttempts(result.expectedAttempts)}` : "impossible",
                  color: result.probability > 0.01 ? "var(--status-positive)"
                    : result.probability > 0.0001 ? "var(--status-warning)"
                    : "var(--status-negative)",
                },
                {
                  label: "Expected Chaos Orbs",
                  value: fmtAttempts(result.expectedAttempts),
                  sub: `× ${result.chaosPriceExalt.toFixed(2)} ex each`,
                  color: "var(--text-primary)",
                },
                {
                  label: "Expected cost",
                  value: fmtCost(result.expectedCostDisplay, result.displayCurrency),
                  sub: result.displayCurrency === "divine"
                    ? `${result.expectedCostExalt.toFixed(1)} ex`
                    : `${(result.expectedCostExalt / result.divineInExalt).toFixed(2)} div`,
                  color: "var(--status-info)",
                },
              ].map(card => (
                <div key={card.label} className="rounded-lg p-4 border"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{card.label}</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: card.color }}>{card.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>{card.sub}</p>
                </div>
              ))}
            </div>

            {/* Milestone cards */}
            {result.chartData.length > 0 && (() => {
              const milestones = [
                { label: "50% chance by", prob: 0.5 },
                { label: "90% chance by", prob: 0.9 },
                { label: "99% chance by", prob: 0.99 },
              ].map(({ label, prob }) => ({
                label,
                point: result.chartData.find(d => d.probability >= prob),
              })).filter(m => m.point);

              return milestones.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {milestones.map(({ label, point }) => {
                    const useDiv = point!.costExalt >= result.divineInExalt;
                    const dispCost = useDiv ? point!.costExalt / result.divineInExalt : point!.costExalt;
                    return (
                      <div key={label} className="rounded-lg px-4 py-3 border"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                        <p className="text-xs" style={{ color: "var(--text-disabled)" }}>{label}</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {fmtCost(dispCost, useDiv ? "divine" : "exalt")}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                          {fmtAttempts(point!.attempts)} attempts
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null;
            })()}

            {/* Chart */}
            {result.chartData.length > 1 && (
              <div className="rounded-lg p-4 border"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">Cost vs Success Probability</p>
                  <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                    {result.mode === "exact" ? "Exact tiers" : "Min tiers"} · Chaos Orb · 100k sims
                    {result.elapsed_ms ? ` · ${result.elapsed_ms}ms` : ""}
                  </p>
                </div>
                <CostProbChart data={result.chartData} divineInExalt={result.divineInExalt} />
              </div>
            )}

            {result.probability === 0 && (
              <div className="rounded-lg p-4 text-sm"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--status-warning)" }}>
                Probability is 0 — one or more target mods are not in the pool for this base at
                ilvl {selected?.ilvl}. Check that all target mods are valid for this item type.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
