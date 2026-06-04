"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { SolverResult, ChartPoint } from "@/lib/craft-solver";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IdealItem {
  idealId:    string;
  name:       string;
  classId:    string;
  baseId:     string;
  itemBase:   string;
  ilvl:       number;
  targetMods: { modId: string; label: string; affix: string; tier: number; minTier: number | "" }[];
}

interface ClassDef  { id: string; label: string; baseIds: string[] }
interface BaseItem  { name: string; dropLevel: number }
interface ItemData  { classes: ClassDef[]; baseItems: Record<string, BaseItem[]> }

let itemDataCache: ItemData | null = null;
async function loadItemData(): Promise<ItemData> {
  if (itemDataCache) return itemDataCache;
  itemDataCache = await fetch("/ideal-item-data.json").then(r => r.json());
  return itemDataCache!;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtProb(p: number): string {
  if (p === 0) return "0%";
  if (p < 0.0001) return `${(p * 100).toFixed(4)}%`;
  if (p < 0.01)   return `${(p * 100).toFixed(3)}%`;
  if (p < 0.1)    return `${(p * 100).toFixed(2)}%`;
  return `${(p * 100).toFixed(1)}%`;
}

function fmtCost(v: number, cur: "exalt" | "divine"): string {
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${s} ${cur === "divine" ? "div" : "ex"}`;
}

function fmtAttempts(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ── Chart component ───────────────────────────────────────────────────────────

function CostProbChart({ data, divineInExalt }: { data: ChartPoint[]; divineInExalt: number }) {
  const maxCost   = data[data.length - 1]?.costExalt ?? 1;
  const useDiv    = maxCost >= divineInExalt;
  const divisor   = useDiv ? divineInExalt : 1;
  const curLabel  = useDiv ? "div" : "ex";

  const chartData = data.map(d => ({
    cost: d.costExalt / divisor,
    prob: +(d.probability * 100).toFixed(2),
  }));

  // Reference lines for 50% and 90%
  const p50 = data.find(d => d.probability >= 0.5);
  const p90 = data.find(d => d.probability >= 0.9);

  return (
    <div>
      <p className="text-xs mb-2" style={{ color: "var(--text-disabled)" }}>
        Cost ({curLabel}) vs Cumulative Probability
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="cost"
            tickFormatter={v => `${v.toFixed(v < 10 ? 1 : 0)}${curLabel}`}
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
            stroke="var(--border)"
          />
          <YAxis
            tickFormatter={v => `${v}%`}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
            stroke="var(--border)"
            width={40}
          />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, "Probability"]}
            labelFormatter={(v: unknown) => `Cost: ${(v as number).toFixed(2)} ${curLabel}`}
          />
          {p50 && (
            <ReferenceLine x={p50.costExalt / divisor} stroke="var(--status-warning)"
              strokeDasharray="4 4" label={{ value: "50%", fill: "var(--status-warning)", fontSize: 10 }} />
          )}
          {p90 && (
            <ReferenceLine x={p90.costExalt / divisor} stroke="var(--status-negative)"
              strokeDasharray="4 4" label={{ value: "90%", fill: "var(--status-negative)", fontSize: 10 }} />
          )}
          <Area type="monotone" dataKey="prob" stroke="var(--accent)" fill="url(#probGrad)"
            strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CraftPage() {
  const [classes, setClasses]       = useState<ClassDef[]>([]);
  const [baseItems, setBaseItems]   = useState<BaseItem[]>([]);
  const [idealItems, setIdealItems] = useState<IdealItem[]>([]);

  const [classId, setClassId]       = useState("accessory.ring");
  const [baseId, setBaseId]         = useState("1");
  const [ilvl, setIlvl]             = useState(84);
  const [idealId, setIdealId]       = useState("");
  const [mode, setMode]             = useState<"exact" | "minTier">("minTier");

  const [solving, setSolving]       = useState(false);
  const [result, setResult]         = useState<SolverResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // Load item classes and ideal items
  useEffect(() => {
    loadItemData().then(d => {
      setClasses(d.classes);
      const cls = d.classes.find(c => c.id === classId);
      const bid = cls?.baseIds[0] ?? "1";
      setBaseId(bid);
      setBaseItems(d.baseItems[bid] ?? []);
    });

    fetch("/api/ideal-items")
      .then(r => r.json())
      .then(d => setIdealItems(d.idealItems ?? []));
  }, []);

  // Update base items when class changes
  useEffect(() => {
    loadItemData().then(d => {
      const cls = d.classes.find(c => c.id === classId);
      const bid = cls?.baseIds[0] ?? "1";
      setBaseId(bid);
      setBaseItems(d.baseItems[bid] ?? []);
      setIdealId(""); // reset ideal selection
      setResult(null);
    });
  }, [classId]);

  // Filter ideal items to same class
  const matchingIdeals = idealItems.filter(item => item.classId === classId);

  // Selected ideal item details
  const selectedIdeal = idealItems.find(i => i.idealId === idealId);

  async function solve() {
    if (!idealId || !baseId) return;
    setSolving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/craft/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseId, idealItemId: idealId, mode }),
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
  const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 };

  return (
    <div className="flex gap-6 h-full" style={{ color: "var(--text-primary)" }}>

      {/* Left: Inputs */}
      <aside className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <h2 className="font-semibold text-sm mb-4">Craft Solver</h2>

        {/* Item class */}
        <div className="mb-3">
          <label style={lbl}>Item Class</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={sel}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        {/* Base type */}
        <div className="mb-3">
          <label style={lbl}>Base Type</label>
          <select value={baseId} onChange={e => setBaseId(e.target.value)} style={sel}>
            {baseItems.map(b => <option key={b.name} value={baseId}>{b.name}</option>)}
          </select>
        </div>

        {/* iLvl */}
        <div className="mb-4">
          <label style={lbl}>Item Level</label>
          <input type="number" min={1} max={100} value={ilvl}
            onChange={e => setIlvl(Math.max(1, Math.min(100, parseInt(e.target.value) || 84)))}
            style={sel} />
        </div>

        <div className="border-t mb-4" style={{ borderColor: "var(--border)" }} />

        {/* Ideal item */}
        <div className="mb-3">
          <label style={lbl}>Target Ideal Item</label>
          {matchingIdeals.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
              No ideal items for this class.{" "}
              <a href="/ideal-items" style={{ color: "var(--accent)" }}>Create one</a>
            </p>
          ) : (
            <select value={idealId} onChange={e => setIdealId(e.target.value)} style={sel}>
              <option value="">— select —</option>
              {matchingIdeals.map(i => (
                <option key={i.idealId} value={i.idealId}>{i.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Target mod preview */}
        {selectedIdeal && selectedIdeal.targetMods.length > 0 && (
          <div className="rounded-md p-2 mb-3" style={{ background: "var(--bg-elevated)" }}>
            {selectedIdeal.targetMods.map((m, i) => (
              <p key={i} className="text-xs truncate" style={{ color: "var(--status-info)" }}>
                <span style={{ color: "var(--text-disabled)", fontSize: 9, marginRight: 4 }}>
                  {m.affix === "prefix" ? "P" : "S"}
                </span>
                {m.label} T{m.tier}
                {m.minTier && m.minTier !== m.tier ? `–T${m.minTier}` : ""}
              </p>
            ))}
          </div>
        )}

        {/* Mode */}
        <div className="mb-4">
          <label style={lbl}>Mode</label>
          <div className="flex flex-col gap-1.5">
            {(["minTier", "exact"] as const).map(m => (
              <label key={m} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="mode" value={m} checked={mode === m}
                  onChange={() => setMode(m)} style={{ marginTop: 2, accentColor: "var(--accent)" }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {m === "exact" ? "Exact tiers" : "Minimum tiers"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                    {m === "exact"
                      ? "Must match the exact tier specified"
                      : "Any tier up to the minimum acceptable"}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button onClick={solve} disabled={solving || !idealId}
          className="w-full py-2.5 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
          {solving ? "Calculating…" : "Calculate"}
        </button>
      </aside>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {error && (
          <div className="rounded-lg p-3 mb-4 text-sm"
            style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
            {error}
          </div>
        )}

        {solving && (
          <div className="flex items-center justify-center h-48" style={{ color: "var(--text-disabled)" }}>
            <p className="text-sm">Running Monte Carlo simulation…</p>
          </div>
        )}

        {!solving && !result && !error && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              Select a base and ideal item, then calculate.
            </p>
            <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
              The solver estimates cost and probability using 100k simulated Chaos Orb rolls.
            </p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-5">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Probability per attempt",
                  value: fmtProb(result.probability),
                  sub: result.probability > 0 ? `1 in ${fmtAttempts(result.expectedAttempts)}` : "impossible",
                  color: result.probability > 0.01 ? "var(--status-positive)" : result.probability > 0.001 ? "var(--status-warning)" : "var(--status-negative)",
                },
                {
                  label: "Expected attempts",
                  value: fmtAttempts(result.expectedAttempts),
                  sub: "Chaos Orbs",
                  color: "var(--text-primary)",
                },
                {
                  label: "Expected cost",
                  value: fmtCost(result.expectedCostDisplay, result.displayCurrency),
                  sub: result.displayCurrency === "divine"
                    ? `${result.expectedCostExalt.toFixed(1)} ex`
                    : `${(result.expectedCostExalt / result.divineInExalt).toFixed(2)} div equiv`,
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

            {/* Milestones */}
            {result.chartData.length > 0 && (() => {
              const p50 = result.chartData.find(d => d.probability >= 0.5);
              const p90 = result.chartData.find(d => d.probability >= 0.9);
              const p99 = result.chartData.find(d => d.probability >= 0.99);
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "50% chance by", point: p50 },
                    { label: "90% chance by", point: p90 },
                    { label: "99% chance by", point: p99 },
                  ].map(({ label, point }) => point && (
                    <div key={label} className="rounded-lg px-4 py-3 border"
                      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                      <p className="text-xs" style={{ color: "var(--text-disabled)" }}>{label}</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {fmtCost(
                          point.costExalt >= result.divineInExalt ? point.costExalt / result.divineInExalt : point.costExalt,
                          point.costExalt >= result.divineInExalt ? "divine" : "exalt"
                        )}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                        {fmtAttempts(point.attempts)} attempts
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Chart */}
            {result.chartData.length > 1 && (
              <div className="rounded-lg p-4 border"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Cost vs Success Probability</p>
                  <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
                    {result.mode === "exact" ? "Exact tiers" : "Minimum tiers"} · Chaos Orb rerolling · 100k simulations
                  </p>
                </div>
                <CostProbChart data={result.chartData} divineInExalt={result.divineInExalt} />
              </div>
            )}

            {result.probability === 0 && (
              <div className="rounded-lg p-4 text-sm"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--status-warning)" }}>
                Probability is effectively 0 — one or more target mods may not be in the mod pool for this base at ilvl {selectedIdeal?.ilvl}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
