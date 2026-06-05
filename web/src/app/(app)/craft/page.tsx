"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import type { SolverOutput, PatternResult, CostSummary, CraftStep } from "@/lib/craft-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetMod {
  modId: string; label: string; affix: "prefix"|"suffix";
  tier: number; minTier: number | "";
}
interface IdealItem {
  idealId: string; name: string; classId: string;
  baseId: string; itemBase: string; ilvl: number; targetMods: TargetMod[];
}

const CRAFT_API_URL = process.env.NEXT_PUBLIC_CRAFT_API_URL ?? "";

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtEx(v: number | null | undefined, div: number): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= div) {
    const d = v / div;
    return `${d >= 100 ? d.toFixed(0) : d >= 10 ? d.toFixed(1) : d.toFixed(2)} div`;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ex`;
}

// ── Distribution bar ──────────────────────────────────────────────────────────

function CostDistBar({ cost, div }: { cost: CostSummary; div: number }) {
  const metrics = [
    { label: "Mean",  value: cost.mean, color: "var(--status-info)" },
    { label: "p50",   value: cost.p50,  color: "var(--status-positive)" },
    { label: "p90",   value: cost.p90,  color: "var(--status-warning)" },
    { label: "p99",   value: cost.p99,  color: "var(--status-negative)" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {metrics.map(m => (
        <div key={m.label} className="text-center">
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>{m.label}</p>
          <p className="text-sm font-semibold tabular-nums" style={{ color: m.color }}>
            {fmtEx(m.value, div)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Pattern card ──────────────────────────────────────────────────────────────

function PatternCard({ pattern, div, selected, onClick }: {
  pattern: PatternResult; div: number; selected: boolean; onClick: () => void;
}) {
  return (
    <div onClick={onClick} className="rounded-lg border p-4 cursor-pointer"
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-surface)",
        borderColor: pattern.is_best ? "var(--status-positive)" : selected ? "var(--accent)" : "var(--border)",
        borderWidth: pattern.is_best || selected ? 2 : 1,
      }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {pattern.is_best && (
              <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                style={{ background: "var(--status-positive)", color: "#000" }}>BEST</span>
            )}
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {pattern.pattern_name}
            </p>
          </div>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>{pattern.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold" style={{ color: pattern.is_best ? "var(--status-positive)" : "var(--status-info)" }}>
            {fmtEx(pattern.cost.mean, div)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>expected</p>
        </div>
      </div>
      <CostDistBar cost={pattern.cost} div={div} />
    </div>
  );
}

// ── Steps display ─────────────────────────────────────────────────────────────

function StepsList({ steps, div }: { steps: CraftStep[]; div: number }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 10 }}>
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ color: "var(--text-secondary)" }}>{step.action}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5" style={{ color: "var(--text-disabled)", fontSize: 10 }}>
              {step.currency && <span>{step.currency.replace(/_/g, " ")}</span>}
              {step.probability > 0 && step.probability < 1 && (
                <span style={{ color: "var(--status-info)" }}>{(step.probability * 100).toFixed(1)}% / attempt</span>
              )}
              {step.expectedCost > 0 && <span>~{fmtEx(step.expectedCost, div)}</span>}
              {step.branchCondition && <span style={{ color: "var(--text-disabled)" }}>· {step.branchCondition}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Cost-vs-success curve (cumulative CDF) ──────────────────────────────────────

function CostCurve({ cost, div }: { cost: CostSummary; div: number }) {
  if (!cost.costCdf?.length) return null;
  const data = cost.costCdf.map(p => ({ cost: p.cost, prob: Math.round(p.cumProb * 100) }));
  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--accent)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="cost" tickFormatter={(v) => fmtEx(v, div)} tick={{ fill: "var(--text-disabled)", fontSize: 10 }}
            stroke="var(--border)" />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--text-disabled)", fontSize: 10 }}
            stroke="var(--border)" width={36} />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "var(--text-secondary)" }}
            formatter={(v) => [`${Number(v)}% chance done`, "P(success)"]}
            labelFormatter={(v) => `≤ ${fmtEx(Number(v), div)}`} />
          <Area type="monotone" dataKey="prob" stroke="var(--accent)" fill="url(#curveFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CraftPage() {
  const [idealItems, setIdealItems]   = useState<IdealItem[]>([]);
  const [idealId, setIdealId]         = useState("");
  const [mode, setMode]               = useState<"exact"|"minTier">("minTier");
  const [kRequired, setKRequired]     = useState<number | "all">("all");
  const [solving, setSolving]         = useState(false);
  const [result, setResult]           = useState<SolverOutput & { prices?: Record<string,number> } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [selectedId, setSelectedId]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideal-items").then(r => r.json()).then(d => {
      const items = (d.idealItems ?? []) as IdealItem[];
      setIdealItems(items);
      const first = items.find(i => i.targetMods?.length > 0);
      if (first) setIdealId(first.idealId);
    });
  }, []);

  const selected = idealItems.find(i => i.idealId === idealId);
  const div = result?.prices?.divine ?? 90;

  async function solve() {
    if (!selected?.targetMods?.length) return;
    setSolving(true); setError(null); setResult(null); setSelectedId(null);

    try {
      if (!CRAFT_API_URL) throw new Error("NEXT_PUBLIC_CRAFT_API_URL is not configured");

      const targetMods = selected.targetMods.filter(m => m.modId).map(m => ({
        modId:   m.modId,
        name:    m.label,
        affix:   m.affix,
        tier:    Number(m.tier)    || 1,
        minTier: Number(m.minTier) || Number(m.tier) || 1,
      }));

      const k = kRequired === "all" ? targetMods.length : Number(kRequired);

      // 1) mint a short-lived bearer token for the AWS API
      const tokRes = await fetch("/api/craft/token");
      const tok = await tokRes.json();
      if (!tokRes.ok) throw new Error(tok.error ?? "Could not obtain craft token");
      const auth = { Authorization: `Bearer ${tok.token}` };

      // 2) start the solver (async) — mod pool is loaded server-side from DynamoDB
      const startRes = await fetch(`${CRAFT_API_URL}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ baseId: selected.baseId, ilvl: selected.ilvl, targetMods, mode, k_required: k }),
      });
      const start = await startRes.json();
      if (!startRes.ok) throw new Error(start.error ?? startRes.statusText);
      const executionArn: string = start.executionArn;
      if (!executionArn) throw new Error("Solver did not start");

      // 3) poll until the execution completes (Standard workflow, no 30s cap).
      // Tolerate transient network blips (e.g. ERR_NETWORK_CHANGED) — a dropped
      // poll shouldn't kill a run that's still progressing server-side.
      const deadline = Date.now() + 5 * 60 * 1000;
      let data: SolverOutput | null = null;
      let terminalError: Error | null = null;
      let consecutiveErrors = 0;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500));
        let s: { status?: string; output?: SolverOutput; error?: string };
        try {
          const sRes = await fetch(`${CRAFT_API_URL}/status?executionArn=${encodeURIComponent(executionArn)}`, { headers: auth });
          s = await sRes.json();
          if (!sRes.ok) throw new Error(s.error ?? sRes.statusText);
        } catch {
          // Transient network/poll error — give up only after ~15s of outages.
          if (++consecutiveErrors >= 10) throw new Error("Lost connection while solving");
          continue;
        }
        consecutiveErrors = 0;
        if (s.status === "SUCCEEDED") { data = s.output ?? null; break; }
        if (s.status && s.status !== "RUNNING") { terminalError = new Error(s.error ?? `Solver ${s.status}`); break; }
      }
      if (terminalError) throw terminalError;
      if (!data) throw new Error("Solver timed out");
      if (!data.feasible) throw new Error(data.error ?? "No feasible craft path found");
      setResult(data);
      const best = data.all_patterns?.find((p: PatternResult) => p.is_best);
      if (best) setSelectedId(best.pattern_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSolving(false);
    }
  }

  const activePattern = result?.all_patterns?.find(p => p.pattern_id === selectedId);

  const sel: React.CSSProperties = {
    background:"var(--bg-elevated)",border:"1px solid var(--border)",
    color:"var(--text-primary)",borderRadius:6,fontSize:13,padding:"7px 10px",width:"100%",outline:"none",
  };
  const lbl: React.CSSProperties = { fontSize:11,color:"var(--text-secondary)",display:"block",marginBottom:4 };

  return (
    <div className="flex gap-6 h-full" style={{ color: "var(--text-primary)" }}>

      {/* Left panel */}
      <aside className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0 max-h-[calc(100vh-80px)] overflow-y-auto"
        style={{ background:"var(--bg-surface)", borderColor:"var(--border)" }}>
        <h2 className="font-semibold text-sm mb-1">Craft Solver</h2>
        <p className="text-xs mb-4" style={{ color:"var(--text-disabled)" }}>
          Compares crafting strategies per the PoE2 cost algorithm spec.
          Chaos = single replace (not full reroll). Group exclusivity blocking applied.
        </p>

        <div className="mb-3">
          <label style={lbl}>Ideal Item</label>
          {idealItems.length === 0 ? (
            <p className="text-xs" style={{ color:"var(--text-disabled)" }}>
              No ideal items. <a href="/ideal-items" style={{ color:"var(--accent)" }}>Create one →</a>
            </p>
          ) : (
            <select value={idealId} onChange={e => { setIdealId(e.target.value); setResult(null); }} style={sel}>
              <option value="">— select —</option>
              {idealItems.map(i => (
                <option key={i.idealId} value={i.idealId} disabled={!i.targetMods?.length}>
                  {i.name}{!i.targetMods?.length ? " (no mods)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && selected.targetMods.filter(m => m.modId).length > 0 && (
          <div className="rounded-md p-2.5 mb-3" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color:"var(--text-secondary)" }}>
              {selected.itemBase || selected.classId} · ilvl {selected.ilvl}
            </p>
            {selected.targetMods.filter(m => m.modId).map((m, i) => (
              <div key={i} className="flex items-center gap-1 mt-0.5">
                <span style={{ fontSize:9, color:"var(--text-disabled)" }}>{m.affix==="prefix"?"P":"S"}</span>
                <p className="text-xs truncate" style={{ color:"var(--status-info)" }}>
                  {m.label}{" "}
                  <span style={{ color:"var(--text-disabled)" }}>T{m.tier}{m.minTier&&m.minTier!==m.tier?`–T${m.minTier}`:""}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* k-of-n */}
        {selected && selected.targetMods.filter(m => m.modId).length > 1 && (
          <div className="mb-3">
            <label style={lbl}>Mods required (k-of-n)</label>
            <select value={kRequired} onChange={e => setKRequired(e.target.value === "all" ? "all" : Number(e.target.value))} style={sel}>
              <option value="all">All {selected.targetMods.filter(m=>m.modId).length} mods</option>
              {Array.from({ length: selected.targetMods.filter(m=>m.modId).length - 1 }, (_, i) => i + 1).map(k => (
                <option key={k} value={k}>{k} of {selected.targetMods.filter(m=>m.modId).length}</option>
              ))}
            </select>
          </div>
        )}

        {/* Mode */}
        <div className="mb-5">
          <label style={lbl}>Tier mode</label>
          <div className="flex flex-col gap-1.5">
            {(["minTier","exact"] as const).map(m => (
              <label key={m} className="flex items-start gap-2 cursor-pointer p-2 rounded"
                style={{ background:mode===m?"var(--bg-elevated)":"transparent", border:`1px solid ${mode===m?"var(--accent)":"transparent"}` }}>
                <input type="radio" name="mode" value={m} checked={mode===m}
                  onChange={() => { setMode(m); setResult(null); }}
                  style={{ marginTop:2, accentColor:"var(--accent)", flexShrink:0 }}/>
                <div>
                  <p className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>
                    {m==="exact" ? "Exact tiers" : "Minimum tiers"}
                  </p>
                  <p className="text-xs" style={{ color:"var(--text-disabled)" }}>
                    {m==="exact" ? "Must hit the exact tier specified" : "Any tier ≤ min acceptable"}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button onClick={solve}
          disabled={solving || !idealId || !selected?.targetMods?.filter(m => m.modId).length}
          className="w-full py-2.5 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{ background:"var(--accent)", color:"#fff", border:"none" }}>
          {solving ? "Comparing paths…" : "Find Optimal Craft"}
        </button>
        {solving && (
          <p className="text-xs text-center mt-2" style={{ color:"var(--text-disabled)" }}>
            Running 50k simulations per pattern…
          </p>
        )}

        {result && (
          <div className="mt-4 pt-3 border-t text-xs" style={{ borderColor:"var(--border)", color:"var(--text-disabled)" }}>
            <p className="font-semibold mb-1" style={{ color:"var(--text-secondary)" }}>Prices (ex)</p>
            {Object.entries(result.prices ?? {}).filter(([,v]) => v > 0).slice(0, 6).map(([k, v]) => (
              <p key={k}>{k.replace(/_/g," ")}: {(v as number).toFixed(2)}</p>
            ))}
            <p className="mt-1">{result.elapsed_ms}ms total</p>
          </div>
        )}
      </aside>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {error && (
          <div className="rounded-lg p-3 text-sm"
            style={{ background:"#3a1a1a", border:"1px solid var(--status-negative)", color:"var(--status-negative)" }}>
            {error}
          </div>
        )}

        {!result && !error && !solving && (
          <div className="flex flex-col items-center justify-center h-56 text-center">
            <p className="text-sm mb-1" style={{ color:"var(--text-secondary)" }}>Select an ideal item and find the optimal craft path.</p>
            <p className="text-xs" style={{ color:"var(--text-disabled)" }}>
              Compares Alchemy→Chaos, Alt-Regal, Essence anchor, and Fracture strategies.
              Chaos = single replace per PoE2 rules. Group exclusivity tracked on every draw.
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Pattern list */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:"var(--text-disabled)" }}>
                Crafting Strategies — ranked by expected cost · click to see steps & distribution
              </p>
              <div className="flex flex-col gap-2">
                {result.all_patterns?.map(p => (
                  <PatternCard key={p.pattern_id} pattern={p} div={div}
                    selected={selectedId === p.pattern_id}
                    onClick={() => setSelectedId(p.pattern_id)} />
                ))}
              </div>
            </div>

            {/* Selected pattern detail */}
            {activePattern && (
              <div className="rounded-lg p-4 border" style={{ background:"var(--bg-surface)", borderColor:"var(--border)" }}>
                <p className="text-sm font-semibold mb-3">{activePattern.pattern_name} — Steps</p>
                <StepsList steps={activePattern.steps} div={div} />

                <div className="mt-4 pt-3 border-t" style={{ borderColor:"var(--border)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-secondary)" }}>
                    Probability of success vs. cumulative cost
                  </p>
                  <CostCurve cost={activePattern.cost} div={div} />
                </div>

                <div className="mt-4 pt-3 border-t" style={{ borderColor:"var(--border)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-secondary)" }}>Cost Distribution</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label:"Expected (mean)", value: activePattern.cost.mean, color:"var(--status-info)" },
                      { label:"Median (p50)",    value: activePattern.cost.p50,  color:"var(--status-positive)" },
                      { label:"90th pct",        value: activePattern.cost.p90,  color:"var(--status-warning)" },
                      { label:"99th pct",        value: activePattern.cost.p99,  color:"var(--status-negative)" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg p-3 border text-center"
                        style={{ background:"var(--bg-elevated)", borderColor:"var(--border)" }}>
                        <p className="text-xs mb-1" style={{ color:"var(--text-disabled)" }}>{label}</p>
                        <p className="text-base font-bold" style={{ color }}>{fmtEx(value, div)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mean basket */}
                {activePattern.basket_mean && Object.keys(activePattern.basket_mean).length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor:"var(--border)" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-secondary)" }}>Average currency used per successful craft</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(activePattern.basket_mean).map(([k, v]) => (
                        <span key={k} className="text-xs px-2 py-1 rounded"
                          style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
                          {k.replace(/_/g," ")}: <strong style={{ color:"var(--text-primary)" }}>{typeof v === "number" ? v.toFixed(1) : v}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
