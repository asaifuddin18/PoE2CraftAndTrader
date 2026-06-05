"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { SolverResult, CraftPath, ModBreakdown } from "@/lib/craft-solver";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetMod {
  modId: string; label: string; affix: "prefix"|"suffix";
  tier: number; minTier: number | "";
}
interface IdealItem {
  idealId: string; name: string; classId: string;
  baseId: string; itemBase: string; ilvl: number; targetMods: TargetMod[];
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

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtProb(p: number): string {
  if (p <= 0) return "0%";
  if (p < 0.0001) return `${(p * 100).toFixed(5)}%`;
  if (p < 0.01)   return `${(p * 100).toFixed(3)}%`;
  if (p < 0.1)    return `${(p * 100).toFixed(2)}%`;
  return `${(p * 100).toFixed(1)}%`;
}
function fmtEx(v: number | null, div: number): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= div) {
    const d = v / div;
    return `${d >= 100 ? d.toFixed(0) : d >= 10 ? d.toFixed(1) : d.toFixed(2)} div`;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ex`;
}
function fmtAttempts(n: number | null): string {
  if (n == null || !isFinite(n)) return "∞";
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function CostChart({ data, div }: { data: CraftPath["chartData"]; div: number }) {
  if (!data.length) return <p className="text-xs text-center py-6" style={{color:"var(--text-disabled)"}}>No chart data for multi-phase paths</p>;
  const useDiv = data[data.length-1]?.costExalt >= div;
  const divisor = useDiv ? div : 1;
  const label = useDiv ? "div" : "ex";
  const pts = data.map(d => ({ cost: +(d.costExalt/divisor).toFixed(2), prob: +(d.probability*100).toFixed(2) }));
  const p50 = data.find(d => d.probability >= 0.5);
  const p90 = data.find(d => d.probability >= 0.9);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={pts} margin={{top:6,right:12,left:0,bottom:0}}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
        <XAxis dataKey="cost" tickFormatter={v=>`${v}${label}`} tick={{fontSize:9,fill:"var(--text-disabled)"}} stroke="var(--border)"/>
        <YAxis tickFormatter={v=>`${v}%`} domain={[0,100]} tick={{fontSize:9,fill:"var(--text-disabled)"}} stroke="var(--border)" width={34}/>
        <Tooltip contentStyle={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:6,fontSize:11}}
          formatter={(v:unknown)=>[`${(v as number).toFixed(2)}%`,"P(success)"]}
          labelFormatter={(v:unknown)=>`Cost: ${v} ${label}`}/>
        {p50 && <ReferenceLine x={+(p50.costExalt/divisor).toFixed(2)} stroke="var(--status-warning)" strokeDasharray="4 4"
          label={{value:"50%",fill:"var(--status-warning)",fontSize:9,position:"top"}}/>}
        {p90 && <ReferenceLine x={+(p90.costExalt/divisor).toFixed(2)} stroke="var(--status-negative)" strokeDasharray="4 4"
          label={{value:"90%",fill:"var(--status-negative)",fontSize:9,position:"top"}}/>}
        <Area type="monotone" dataKey="prob" stroke="var(--accent)" fill="url(#cg)" strokeWidth={2} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Path card ─────────────────────────────────────────────────────────────────

function PathCard({ path, div, selected, onClick }: {
  path: CraftPath; div: number; selected: boolean; onClick: ()=>void;
}) {
  const costColor = path.isBest ? "var(--status-positive)" : "var(--status-info)";
  return (
    <div onClick={onClick} className="rounded-lg border p-3 cursor-pointer"
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-surface)",
        borderColor: selected ? "var(--accent)" : path.isBest ? "var(--status-positive)" : "var(--border)",
        borderWidth: selected || path.isBest ? 2 : 1,
      }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-xs font-semibold" style={{color:"var(--text-primary)"}}>
            {path.isBest && <span className="mr-1.5" style={{color:"var(--status-positive)"}}>★</span>}
            {path.name}
          </p>
          {path.isAnalytical && (
            <span className="text-xs" style={{color:"var(--status-warning)"}}>analytical</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold" style={{color: costColor}}>
            {fmtEx(path.expectedCostExalt, div)}
          </p>
        </div>
      </div>
      <p className="text-xs" style={{color:"var(--text-disabled)"}}>{path.description}</p>
      <div className="flex gap-3 mt-2">
        <span className="text-xs" style={{color:"var(--text-secondary)"}}>
          P/attempt: <strong>{fmtProb(path.probability)}</strong>
        </span>
        {path.expectedAttempts && (
          <span className="text-xs" style={{color:"var(--text-secondary)"}}>
            Avg: <strong>{fmtAttempts(path.expectedAttempts)} chaos</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mod breakdown ─────────────────────────────────────────────────────────────

function ModBreakdownTable({ mods, div }: { mods: ModBreakdown[]; div: number }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{borderColor:"var(--border)"}}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{background:"var(--bg-elevated)"}}>
            <th className="text-left px-3 py-2" style={{color:"var(--text-secondary)"}}>Mod</th>
            <th className="text-right px-3 py-2" style={{color:"var(--text-secondary)"}}>P / chaos</th>
            <th className="text-right px-3 py-2" style={{color:"var(--text-secondary)"}}>E[exalt to add]</th>
          </tr>
        </thead>
        <tbody>
          {mods.map((m,i) => (
            <tr key={m.modId} style={{background: i%2===0 ? "var(--bg-surface)" : "var(--bg-elevated)"}}>
              <td className="px-3 py-1.5" style={{color:"var(--status-info)"}}>
                <span className="mr-1.5" style={{fontSize:9,color:"var(--text-disabled)"}}>
                  {m.affix==="prefix"?"P":"S"}
                </span>
                {m.name.length > 40 ? m.name.slice(0,40)+"…" : m.name}
                {i===0 && <span className="ml-1.5 text-xs px-1 rounded" style={{background:"#3a1a1a",color:"var(--status-negative)"}}>bottleneck</span>}
              </td>
              <td className="text-right px-3 py-1.5 tabular-nums" style={{
                color: m.pPerRoll < 0.001 ? "var(--status-negative)" : m.pPerRoll < 0.01 ? "var(--status-warning)" : "var(--status-positive)"
              }}>
                {fmtProb(m.pPerRoll)}
              </td>
              <td className="text-right px-3 py-1.5 tabular-nums" style={{color:"var(--text-secondary)"}}>
                {fmtEx(m.exaltCost, div)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CraftPage() {
  const [idealItems, setIdealItems] = useState<IdealItem[]>([]);
  const [idealId, setIdealId]       = useState("");
  const [mode, setMode]             = useState<"exact"|"minTier">("minTier");
  const [solving, setSolving]       = useState(false);
  const [result, setResult]         = useState<SolverResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideal-items").then(r=>r.json()).then(d=>{
      const items = (d.idealItems ?? []) as IdealItem[];
      setIdealItems(items);
      const first = items.find(i => i.targetMods?.length > 0);
      if (first) setIdealId(first.idealId);
    });
  }, []);

  const selected = idealItems.find(i => i.idealId === idealId);

  async function solve() {
    if (!selected?.targetMods?.length) return;
    setSolving(true); setError(null); setResult(null); setSelectedPath(null);
    try {
      const itemData = await loadItemData();
      const baseMods = (itemData.mods[selected.baseId] ?? []) as ModDef[];
      if (!baseMods.length) throw new Error(`No mod pool found for base "${selected.itemBase}" (id: ${selected.baseId})`);

      const ilvl = selected.ilvl;
      const eligibleMods = baseMods
        .map(m => ({ ...m, tiers: m.tiers.filter(t => t.ilvl <= ilvl && t.weight > 0) }))
        .filter(m => m.tiers.length > 0);

      const targetMods = selected.targetMods.filter(m => m.modId).map(m => ({
        modId:   m.modId, name: m.label, affix: m.affix,
        tier:    Number(m.tier) || 1,
        minTier: Number(m.minTier) || Number(m.tier) || 1,
      }));

      const res = await fetch("/api/craft/solve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseMods: eligibleMods, targetMods, mode, ilvl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setResult(data);
      // Auto-select best path
      const best = (data.paths as CraftPath[]).find(p => p.isBest);
      if (best) setSelectedPath(best.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSolving(false);
    }
  }

  const activePath = result?.paths.find(p => p.id === selectedPath);
  const div = result?.divineInExalt ?? 90;

  const sel: React.CSSProperties = {
    background:"var(--bg-elevated)",border:"1px solid var(--border)",
    color:"var(--text-primary)",borderRadius:6,fontSize:13,padding:"7px 10px",width:"100%",outline:"none",
  };
  const lbl: React.CSSProperties = { fontSize:11,color:"var(--text-secondary)",display:"block",marginBottom:4 };

  return (
    <div className="flex gap-6 h-full" style={{color:"var(--text-primary)"}}>

      {/* Left panel */}
      <aside className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0 max-h-[calc(100vh-80px)] overflow-y-auto"
        style={{background:"var(--bg-surface)",borderColor:"var(--border)"}}>
        <h2 className="font-semibold text-sm mb-1">Craft Solver</h2>
        <p className="text-xs mb-4" style={{color:"var(--text-disabled)"}}>
          Compares multiple crafting strategies and ranks by expected cost.
        </p>

        <div className="mb-3">
          <label style={lbl}>Ideal Item</label>
          {idealItems.length === 0 ? (
            <p className="text-xs" style={{color:"var(--text-disabled)"}}>
              No ideal items. <a href="/ideal-items" style={{color:"var(--accent)"}}>Create one →</a>
            </p>
          ) : (
            <select value={idealId} onChange={e=>{setIdealId(e.target.value);setResult(null);}} style={sel}>
              <option value="">— select —</option>
              {idealItems.map(i=>(
                <option key={i.idealId} value={i.idealId} disabled={!i.targetMods?.length}>
                  {i.name}{!i.targetMods?.length?" (no mods)":""}
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && (
          <div className="rounded-md p-2.5 mb-3" style={{background:"var(--bg-elevated)",border:"1px solid var(--border)"}}>
            <p className="text-xs font-semibold mb-1" style={{color:"var(--text-secondary)"}}>
              {selected.itemBase || selected.classId} · ilvl {selected.ilvl}
            </p>
            {selected.targetMods.filter(m=>m.modId).map((m,i)=>(
              <div key={i} className="flex items-center gap-1 mt-0.5">
                <span style={{fontSize:9,color:"var(--text-disabled)"}}>{m.affix==="prefix"?"P":"S"}</span>
                <p className="text-xs truncate" style={{color:"var(--status-info)"}}>
                  {m.label}{" "}
                  <span style={{color:"var(--text-disabled)"}}>T{m.tier}{m.minTier&&m.minTier!==m.tier?`–T${m.minTier}`:""}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mb-5">
          <label style={lbl}>Mode</label>
          <div className="flex flex-col gap-1.5">
            {(["minTier","exact"] as const).map(m=>(
              <label key={m} className="flex items-start gap-2 cursor-pointer p-2 rounded"
                style={{background:mode===m?"var(--bg-elevated)":"transparent",border:`1px solid ${mode===m?"var(--accent)":"transparent"}`}}>
                <input type="radio" name="mode" value={m} checked={mode===m}
                  onChange={()=>{setMode(m);setResult(null);}}
                  style={{marginTop:2,accentColor:"var(--accent)",flexShrink:0}}/>
                <div>
                  <p className="text-xs font-semibold" style={{color:"var(--text-primary)"}}>
                    {m==="exact"?"Exact tiers":"Minimum tiers"}
                  </p>
                  <p className="text-xs" style={{color:"var(--text-disabled)"}}>
                    {m==="exact"?"Must hit the exact tier specified":"Any tier up to min acceptable"}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button onClick={solve}
          disabled={solving||!idealId||!selected?.targetMods?.filter(m=>m.modId).length}
          className="w-full py-2.5 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
          style={{background:"var(--accent)",color:"#fff",border:"none"}}>
          {solving?"Comparing paths…":"Compare Crafting Paths"}
        </button>
        {solving && <p className="text-xs text-center mt-2" style={{color:"var(--text-disabled)"}}>Running 100k simulations per path…</p>}
      </aside>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {error && (
          <div className="rounded-lg p-3 text-sm" style={{background:"#3a1a1a",border:"1px solid var(--status-negative)",color:"var(--status-negative)"}}>
            {error}
          </div>
        )}

        {!result && !error && !solving && (
          <div className="flex flex-col items-center justify-center h-56 text-center">
            <p className="text-sm mb-1" style={{color:"var(--text-secondary)"}}>Select an ideal item and compare paths.</p>
            <p className="text-xs" style={{color:"var(--text-disabled)"}}>
              The solver compares Chaos spam, Fracture+Chaos, and Annul+Exalt strategies.
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Path comparison */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-disabled)"}}>
                Crafting Paths — ranked by expected cost
              </p>
              <div className="flex flex-col gap-2">
                {result.paths.map(path => (
                  <PathCard key={path.id} path={path} div={div}
                    selected={selectedPath===path.id}
                    onClick={()=>setSelectedPath(path.id)}/>
                ))}
              </div>
            </div>

            {/* Selected path chart */}
            {activePath && activePath.chartData.length > 1 && (
              <div className="rounded-lg p-4 border" style={{background:"var(--bg-surface)",borderColor:"var(--border)"}}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{activePath.name} — Cost vs Probability</p>
                  <p className="text-xs" style={{color:"var(--text-disabled)"}}>
                    {mode==="exact"?"Exact":"Min"} tiers · {activePath.isAnalytical?"analytical":"100k sims"} · {result.elapsed_ms}ms
                  </p>
                </div>
                <CostChart data={activePath.chartData} div={div}/>
              </div>
            )}

            {/* Mod breakdown */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{color:"var(--text-disabled)"}}>
                Per-Mod Analysis
              </p>
              <ModBreakdownTable mods={result.modBreakdown} div={div}/>
              <p className="text-xs mt-2" style={{color:"var(--text-disabled)"}}>
                "P / chaos" = probability this specific mod appears at acceptable tier in one reroll.
                "E[exalt]" = expected exalts to add this mod to 1 open slot.
                The bottleneck mod drives most of the crafting cost.
              </p>
            </div>

            {/* Currency prices used */}
            <div className="rounded-lg px-4 py-3 border flex gap-4 flex-wrap" style={{background:"var(--bg-elevated)",borderColor:"var(--border)"}}>
              <p className="text-xs" style={{color:"var(--text-disabled)"}}>Prices used:</p>
              {[
                ["Chaos",    result.chaosPriceExalt],
                ["Annul",    result.annulPriceExalt],
                ["1 Divine", result.divineInExalt],
              ].map(([label, val]) => (
                <span key={String(label)} className="text-xs" style={{color:"var(--text-secondary)"}}>
                  {label}: <strong style={{color:"var(--text-primary)"}}>{(val as number).toFixed(2)} ex</strong>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
