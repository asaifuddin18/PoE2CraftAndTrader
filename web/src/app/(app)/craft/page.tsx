"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OptimizerOutput, OutcomeBucket } from "@/lib/craft-types";
import { countMatchingJointOutcomes, eligibleTiers, formatCurrency } from "@/lib/craft-results";

interface ModTier { tier: number; ilvl: number; weight: number; }
interface ModDef { modId: string; name: string; affix: "prefix" | "suffix"; modgroups: string[]; tiers: ModTier[]; }
interface ItemData {
  classes: { id: string; label: string; baseIds: string[] }[];
  equipmentTypes?: { id: string; label: string }[];
  mods: Record<string, ModDef[]>;
}
interface SelectedMod { modId: string; tier: number; fractured?: boolean; }
interface Preference { modId: string; name: string; affix: "prefix" | "suffix"; weight: number; }

const API = process.env.NEXT_PUBLIC_CRAFT_API_URL ?? "";
const CATALYSTS = ["life","mana","defences","physical","fire","cold","lightning","chaos","attack","caster","speed","attribute"];
const emptyStart = { rarity: "normal" as const, prefixes: [] as SelectedMod[], suffixes: [] as SelectedMod[], corrupted: false };

export default function CraftPage() {
  const [data, setData] = useState<ItemData | null>(null);
  const [classId, setClassId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [ilvl, setIlvl] = useState(84);
  const [budget, setBudget] = useState(10);
  const [unit, setUnit] = useState<"exalt" | "divine">("divine");
  const [starting, setStarting] = useState({ ...emptyStart, catalystType: "", catalystAmount: 0 });
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [filters, setFilters] = useState<Record<string, number>>({});
  const [result, setResult] = useState<OptimizerOutput | null>(null);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/ideal-item-data.json").then(response => response.json()).then((next: ItemData) => {
      setData(next);
      setClassId(next.classes[0]?.id ?? "");
      setBaseId(next.classes[0]?.baseIds[0] ?? "");
    });
  }, []);

  const currentClass = data?.classes.find(candidate => candidate.id === classId);
  const mods = useMemo(() => (data?.mods[baseId] ?? []).filter(mod => mod.tiers.some(tier => tier.ilvl <= ilvl && tier.weight > 0)), [data, baseId, ilvl]);
  const prefixes = preferences.filter(preference => preference.affix === "prefix").sort((a, b) => b.weight - a.weight);
  const suffixes = preferences.filter(preference => preference.affix === "suffix").sort((a, b) => b.weight - a.weight);
  const maxScore = preferences.reduce((sum, preference) => sum + preference.weight, 0);

  function changeClass(next: string) {
    const cls = data?.classes.find(candidate => candidate.id === next);
    setClassId(next);
    setBaseId(cls?.baseIds[0] ?? "");
    setStarting({ ...emptyStart, catalystType: "", catalystAmount: 0 });
    setPreferences([]);
    setResult(null);
  }

  function addPreference(modId: string) {
    const mod = mods.find(candidate => candidate.modId === modId);
    if (!mod || preferences.some(candidate => candidate.modId === modId)) return;
    setPreferences(current => [...current, { modId, name: mod.name, affix: mod.affix, weight: 50 }]);
  }

  function addStarting(affix: "prefix" | "suffix", modId: string) {
    const mod = mods.find(candidate => candidate.modId === modId && candidate.affix === affix);
    const tier = mod?.tiers.filter(candidate => candidate.ilvl <= ilvl && candidate.weight > 0).sort((a, b) => a.tier - b.tier)[0]?.tier;
    if (!mod || !tier) return;
    setStarting(current => ({ ...current, [affix === "prefix" ? "prefixes" : "suffixes"]: [...current[affix === "prefix" ? "prefixes" : "suffixes"], { modId, tier }] }));
  }

  async function solve() {
    setSolving(true); setError(""); setResult(null);
    try {
      if (!API) throw new Error("Craft API is not configured");
      const token = await requestJson<{ token: string }>("/api/craft/token", undefined, "Craft token");
      const catalyst = starting.catalystType && starting.catalystAmount > 0
        ? { type: starting.catalystType, amount: starting.catalystAmount, maximum: 20 }
        : undefined;
      const start = await requestJson<{ executionArn: string }>(`${API}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
        body: JSON.stringify({
          baseId, ilvl, budget: { amount: budget, unit },
          startingItem: { ...starting, catalyst },
          preferences,
        }),
      }, "Start optimizer");
      const deadline = Date.now() + 5 * 60_000;
      let pollFailures = 0;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        let status: { status?: string; output?: OptimizerOutput; error?: string };
        try {
          status = await requestJson(`${API}/status?executionArn=${encodeURIComponent(start.executionArn)}`, {
            headers: { Authorization: `Bearer ${token.token}` },
          }, "Optimizer status");
          pollFailures = 0;
        } catch (pollError) {
          pollFailures++;
          if (pollFailures <= 3) continue;
          throw pollError;
        }
        if (status.status === "SUCCEEDED") {
          if (!status.output?.feasible) throw new Error(status.output?.error ?? "Request is not feasible");
          setResult(status.output);
          return;
        }
        if (status.status && status.status !== "RUNNING") throw new Error(status.error ?? `Solver ${status.status}`);
      }
      throw new Error("Solver timed out");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSolving(false); }
  }

  const matching = result ? countMatchingJointOutcomes(result.jointOutcomes, preferences, filters) : 0;
  const div = result?.prices?.divine ?? 90;

  return (
    <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-5 h-full" style={{ color: "var(--text-primary)" }}>
      <aside className="border-r pr-5 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        <div className="mb-5">
          <p className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--status-info)" }}>Budget optimizer</p>
          <h1 className="text-xl font-semibold mt-1">Build the best item this budget can reach</h1>
        </div>
        <Field label="Item class">
          <select value={classId} onChange={event => changeClass(event.target.value)} style={inputStyle}>
            {data?.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.label}</option>)}
          </select>
        </Field>
        <Field label="Equipment type">
          <select value={baseId} onChange={event => { setBaseId(event.target.value); setPreferences([]); setStarting({ ...emptyStart, catalystType:"", catalystAmount:0 }); }} style={inputStyle}>
            {currentClass?.baseIds.map(id => <option key={id} value={id}>{data?.equipmentTypes?.find(type => type.id === id)?.label ?? `Type ${id}`}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Item level"><input type="number" min={1} max={100} value={ilvl} onChange={event => setIlvl(Number(event.target.value))} style={inputStyle}/></Field>
          <Field label="Starting rarity"><select value={starting.rarity} onChange={event => setStarting(current => ({ ...current, rarity: event.target.value as typeof current.rarity, prefixes:[], suffixes:[] }))} style={inputStyle}><option>normal</option><option>magic</option><option>rare</option></select></Field>
        </div>
        <StartingMods title="Starting prefixes" affix="prefix" selected={starting.prefixes} mods={mods} ilvl={ilvl} max={starting.rarity === "normal" ? 0 : starting.rarity === "magic" ? 1 : 3} onAdd={addStarting} onChange={next => setStarting(current => ({ ...current, prefixes: next }))}/>
        <StartingMods title="Starting suffixes" affix="suffix" selected={starting.suffixes} mods={mods} ilvl={ilvl} max={starting.rarity === "normal" ? 0 : starting.rarity === "magic" ? 1 : 3} onAdd={addStarting} onChange={next => setStarting(current => ({ ...current, suffixes: next }))}/>
        <label className="flex items-center gap-2 text-xs mb-3"><input type="checkbox" checked={starting.corrupted} onChange={event => setStarting(current => ({ ...current, corrupted:event.target.checked }))}/> Corrupted</label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Catalyst"><select value={starting.catalystType} onChange={event => setStarting(current => ({ ...current, catalystType:event.target.value }))} style={inputStyle}><option value="">None</option>{CATALYSTS.map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Quality"><input type="number" min={0} max={20} value={starting.catalystAmount} onChange={event => setStarting(current => ({ ...current, catalystAmount:Number(event.target.value) }))} style={inputStyle}/></Field>
        </div>
        <Field label="Desired modifier">
          <select value="" onChange={event => addPreference(event.target.value)} style={inputStyle}><option value="">Add a weighted modifier...</option>{mods.filter(mod => !preferences.some(pref => pref.modId === mod.modId)).map(mod => <option key={mod.modId} value={mod.modId}>{mod.affix === "prefix" ? "P" : "S"} · {mod.name}</option>)}</select>
        </Field>
        <PreferenceList title="Prefixes" values={prefixes} onChange={setPreferences} all={preferences}/>
        <PreferenceList title="Suffixes" values={suffixes} onChange={setPreferences} all={preferences}/>
        <div className="grid grid-cols-[1fr_90px] gap-2 mt-4">
          <input type="number" min={0.01} step={0.1} value={budget} onChange={event => setBudget(Number(event.target.value))} style={inputStyle}/>
          <select value={unit} onChange={event => setUnit(event.target.value as typeof unit)} style={inputStyle}><option value="exalt">Exalts</option><option value="divine">Divines</option></select>
        </div>
        <button onClick={solve} disabled={solving || !baseId || !preferences.length || budget <= 0} className="w-full mt-3 py-2.5 rounded-md text-sm font-semibold disabled:opacity-40" style={{ background:"var(--accent)", color:"#fff" }}>{solving ? "Searching and simulating..." : "Optimize craft"}</button>
        {error && <p className="text-xs mt-3 p-2 rounded" style={{ color:"var(--status-negative)", background:"#321818" }}>{error}</p>}
      </aside>

      <main className="overflow-y-auto pr-2">
        {!result && <EmptyState solving={solving}/>}
        {result && <>
          <div className="grid grid-cols-4 border-y py-4 mb-5" style={{ borderColor:"var(--border)" }}>
            <Metric label="Expected quality" value={`${result.expectedScore.toFixed(1)} / ${maxScore}`}/>
            <Metric label="Expected spend" value={formatCurrency(result.expectedSpend, div)}/>
            <Metric label="Outcomes simulated" value={result.iterations.toLocaleString()}/>
            <Metric label="Observed matches" value={`${((matching / result.iterations) * 100).toFixed(1)}%`}/>
          </div>
          <section className="mb-6">
            <Header title="Outcome explorer" detail="Set tier limits to measure combinations across observed outcomes."/>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 mb-4">
              {preferences.map(preference => <div key={preference.modId} className="grid grid-cols-[1fr_110px] items-center gap-2 text-xs"><span className="truncate">{preference.name}</span><select value={filters[preference.modId] ?? 0} onChange={event => setFilters(current => ({ ...current, [preference.modId]:Number(event.target.value) }))} style={inputStyle}><option value={0}>Ignore</option>{eligibleTiers(mods, preference.modId, ilvl).map(tier => <option key={tier} value={tier}>T{tier} or better</option>)}</select></div>)}
            </div>
            <div className="h-190px h-52"><ResponsiveContainer><BarChart data={Object.entries(result.desiredModCount).map(([mods,count]) => ({ mods:`${mods} mods`, count }))}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="mods" tick={{ fill:"var(--text-disabled)", fontSize:11 }}/><YAxis tick={{ fill:"var(--text-disabled)", fontSize:11 }}/><Tooltip/><Bar dataKey="count" fill="var(--accent)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
          </section>
          <section className="mb-6"><Header title="Per-mod tier outcomes" detail="Marginal probability for each desired modifier."/><div className="grid grid-cols-2 gap-3">{preferences.map(preference => <TierPanel key={preference.modId} preference={preference} counts={result.modTierCounts[mods.find(mod => mod.modId === preference.modId)?.modgroups[0] ?? preference.modId] ?? {}} total={result.iterations}/>)}</div></section>
          <section className="mb-6"><Header title="Most common final items" detail="Representative observed combinations."/><div className="flex flex-col gap-1">{result.outcomes.slice(0,12).map(outcome => <OutcomeRow key={outcome.signature} outcome={outcome} total={result.iterations} div={div}/>)}</div></section>
          <section><Header title="Adaptive policy" detail="Most frequently visited decisions and actions."/><div className="grid grid-cols-2 gap-4"><div>{result.policy.slice(0,12).map(decision => <p key={decision.stateKey} className="text-xs py-1.5 border-b" style={{ borderColor:"var(--border)" }}><strong>{decision.actionName}</strong><span style={{ color:"var(--text-disabled)" }}> · {decision.visits} visits</span></p>)}</div><div>{Object.entries(result.actionCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([action,count]) => <p key={action} className="text-xs py-1.5 border-b flex justify-between" style={{ borderColor:"var(--border)" }}><span>{action}</span><strong>{count}</strong></p>)}</div></div></section>
        </>}
      </main>
    </div>
  );
}

function StartingMods({ title, affix, selected, mods, ilvl, max, onAdd, onChange }: { title:string; affix:"prefix"|"suffix"; selected:SelectedMod[]; mods:ModDef[]; ilvl:number; max:number; onAdd:(affix:"prefix"|"suffix",id:string)=>void; onChange:(next:SelectedMod[])=>void }) {
  return <div className="mb-3"><p className="text-xs mb-1" style={{ color:"var(--text-secondary)" }}>{title} ({selected.length}/{max})</p>{selected.map((value,index) => { const mod=mods.find(candidate=>candidate.modId===value.modId); return <div key={value.modId} className="grid grid-cols-[1fr_58px_30px_24px] gap-1 mb-1 items-center"><span className="text-xs truncate py-1.5">{mod?.name}</span><select value={value.tier} onChange={event=>onChange(selected.map((entry,i)=>i===index?{...entry,tier:Number(event.target.value)}:entry))} style={inputStyle}>{eligibleTiers(mods,value.modId,ilvl).map(tier=><option key={tier} value={tier}>T{tier}</option>)}</select><label className="text-[10px] text-center" title="Fractured"><input type="checkbox" checked={Boolean(value.fractured)} onChange={event=>onChange(selected.map((entry,i)=>i===index?{...entry,fractured:event.target.checked}:entry))}/> F</label><button onClick={()=>onChange(selected.filter((_,i)=>i!==index))}>×</button></div> })}{selected.length<max&&<select value="" onChange={event=>onAdd(affix,event.target.value)} style={inputStyle}><option value="">Add {affix}...</option>{mods.filter(mod=>mod.affix===affix&&!selected.some(value=>value.modId===mod.modId)).map(mod=><option key={mod.modId} value={mod.modId}>{mod.name}</option>)}</select>}</div>;
}
function PreferenceList({ title, values, all, onChange }: { title:string; values:Preference[]; all:Preference[]; onChange:(next:Preference[])=>void }) { return <div className="mb-3"><p className="text-xs font-semibold mb-1">{title}</p>{values.map(value=><div key={value.modId} className="grid grid-cols-[1fr_56px_24px] gap-1 items-center mb-1"><span className="text-xs truncate">{value.name}</span><input type="number" min={1} max={100} value={value.weight} onChange={event=>onChange(all.map(pref=>pref.modId===value.modId?{...pref,weight:Number(event.target.value)}:pref))} style={inputStyle}/><button onClick={()=>onChange(all.filter(pref=>pref.modId!==value.modId))}>×</button></div>)}</div>; }
function Field({ label, children }: { label:string; children:React.ReactNode }) { return <label className="block mb-3"><span className="text-xs block mb-1" style={{ color:"var(--text-secondary)" }}>{label}</span>{children}</label>; }
function Header({ title, detail }: { title:string; detail:string }) { return <div className="mb-3"><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs" style={{ color:"var(--text-disabled)" }}>{detail}</p></div>; }
function Metric({ label, value }: { label:string; value:string|number }) { return <div className="px-4 border-r last:border-r-0" style={{ borderColor:"var(--border)" }}><p className="text-xs" style={{ color:"var(--text-disabled)" }}>{label}</p><p className="text-lg font-semibold mt-1">{value}</p></div>; }
function EmptyState({ solving }: { solving:boolean }) { return <div className="h-full flex items-center justify-center text-center"><div><p className="text-lg font-semibold">{solving?"Searching the craft space":"Configure a budgeted craft"}</p><p className="text-xs mt-1" style={{ color:"var(--text-disabled)" }}>{solving?"The browser will update when all 5,000 outcomes are aggregated.":"Choose the item you own, assign value to desired mods, and set your maximum spend."}</p></div></div>; }
function TierPanel({ preference, counts, total }: { preference:Preference; counts:Record<string,number>; total:number }) { return <div className="border p-3 rounded-md" style={{ borderColor:"var(--border)", background:"var(--bg-surface)" }}><p className="text-xs font-semibold truncate mb-2">{preference.name}</p>{Object.entries(counts).sort().map(([tier,count])=><div key={tier} className="flex justify-between text-xs py-0.5"><span style={{ color:tier==="missing"?"var(--text-disabled)":"var(--status-info)" }}>{tier}</span><span>{((count/total)*100).toFixed(1)}%</span></div>)}</div>; }
function OutcomeRow({ outcome,total,div }: { outcome:OutcomeBucket; total:number; div:number }) { return <div className="grid grid-cols-[90px_1fr_100px] gap-3 py-2 border-b text-xs" style={{ borderColor:"var(--border)" }}><strong>{((outcome.count/total)*100).toFixed(1)}%</strong><span>{outcome.mods.length?outcome.mods.map(mod=>`${mod.name} T${mod.tier}`).join(" · "):"No desired modifiers"}</span><span className="text-right" style={{ color:"var(--text-disabled)" }}>{formatCurrency(outcome.spendSum/outcome.count,div)}</span></div>; }
async function requestJson<T>(url:string, init:RequestInit|undefined, label:string):Promise<T> {
  let response:Response;
  try { response=await fetch(url,init); } catch { throw new Error(`${label} request could not reach the server`); }
  let body:unknown={};
  try { body=await response.json(); } catch { /* error below includes HTTP status */ }
  if (!response.ok) {
    const message=typeof body==="object"&&body&&"error" in body?String((body as {error:unknown}).error):`${label} failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}
const inputStyle:React.CSSProperties={ width:"100%",background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:5,color:"var(--text-primary)",padding:"6px 7px",fontSize:12,outline:"none" };
