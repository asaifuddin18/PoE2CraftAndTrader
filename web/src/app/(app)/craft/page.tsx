"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OptimizerOutput, OutcomeBucket, SimulationTrace } from "@/lib/craft-types";
import { countMatchingJointOutcomes, eligibleTiers, formatCurrency, matchesOutcomeMods } from "@/lib/craft-results";

interface ModTier { tier: number; ilvl: number; weight: number; }
interface ModDef { modId: string; name: string; affix: "prefix" | "suffix"; modgroups: string[]; tiers: ModTier[]; }
interface ItemData {
  classes: { id: string; label: string; baseIds: string[] }[];
  equipmentTypes?: { id: string; label: string }[];
  mods: Record<string, ModDef[]>;
}
interface SelectedMod { modId: string; tier: number; fractured?: boolean; }
interface Preference { modId: string; name: string; affix: "prefix" | "suffix"; weight: number; }
interface StartingState {
  rarity: "normal" | "magic" | "rare";
  prefixes: SelectedMod[];
  suffixes: SelectedMod[];
  corrupted: boolean;
  catalystType: string;
  catalystAmount: number;
}
interface CraftConfig {
  classId: string;
  baseId: string;
  ilvl: number;
  budget: number;
  unit: "exalt" | "divine";
  starting: StartingState;
  preferences: Preference[];
}
interface SavedCraftQuery { craftQueryId:string; name:string; config:CraftConfig; createdAt:string; }

const API = process.env.NEXT_PUBLIC_CRAFT_API_URL ?? "";
const CATALYSTS = ["life","mana","defences","physical","fire","cold","lightning","chaos","attack","caster","speed","attribute"];
const emptyStart: Omit<StartingState, "catalystType" | "catalystAmount"> = { rarity: "normal", prefixes: [], suffixes: [], corrupted: false };

export default function CraftPage() {
  const [data, setData] = useState<ItemData | null>(null);
  const [classId, setClassId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [ilvl, setIlvl] = useState(84);
  const [budget, setBudget] = useState(10);
  const [unit, setUnit] = useState<"exalt" | "divine">("divine");
  const [starting, setStarting] = useState<StartingState>({ ...emptyStart, catalystType: "", catalystAmount: 0 });
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [filters, setFilters] = useState<Record<string, number>>({});
  const [result, setResult] = useState<OptimizerOutput | null>(null);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState("");
  const [savedQueries, setSavedQueries] = useState<SavedCraftQuery[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [exactTraces, setExactTraces] = useState<SimulationTrace[] | null>(null);
  const [loadingTraces, setLoadingTraces] = useState(false);

  useEffect(() => {
    fetch("/ideal-item-data.json").then(response => response.json()).then((next: ItemData) => {
      setData(next);
      setClassId(next.classes[0]?.id ?? "");
      setBaseId(next.classes[0]?.baseIds[0] ?? "");
    });
    loadSavedQueries();
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
    replacePreferences([]);
  }

  function addPreference(modId: string) {
    const mod = mods.find(candidate => candidate.modId === modId);
    if (!mod || preferences.some(candidate => candidate.modId === modId)) return;
    replacePreferences([...preferences, { modId, name: mod.name, affix: mod.affix, weight: 50 }]);
  }

  function replacePreferences(next: Preference[]) {
    setPreferences(next);
    setFilters({});
    setResult(null);
  }

  function addStarting(affix: "prefix" | "suffix", modId: string) {
    const mod = mods.find(candidate => candidate.modId === modId && candidate.affix === affix);
    const tier = mod?.tiers.filter(candidate => candidate.ilvl <= ilvl && candidate.weight > 0).sort((a, b) => a.tier - b.tier)[0]?.tier;
    if (!mod || !tier) return;
    setStarting(current => ({ ...current, [affix === "prefix" ? "prefixes" : "suffixes"]: [...current[affix === "prefix" ? "prefixes" : "suffixes"], { modId, tier }] }));
  }

  function currentConfig(): CraftConfig {
    return { classId, baseId, ilvl, budget, unit, starting, preferences };
  }

  async function loadSavedQueries() {
    try {
      const response = await requestJson<{ craftQueries: SavedCraftQuery[] }>("/api/craft-queries", undefined, "Saved craft queries");
      setSavedQueries(response.craftQueries);
    } catch { /* craft page remains usable if persistence is unavailable */ }
  }

  function loadSavedQuery() {
    const saved = savedQueries.find(query => query.craftQueryId === selectedQueryId);
    if (!saved) return;
    setClassId(saved.config.classId);
    setBaseId(saved.config.baseId);
    setIlvl(saved.config.ilvl);
    setBudget(saved.config.budget);
    setUnit(saved.config.unit);
    setStarting(saved.config.starting);
    replacePreferences(saved.config.preferences);
  }

  async function saveQuery() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const saved = await requestJson<{ craftQueryId:string; createdAt:string }>("/api/craft-queries", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ name:saveName.trim(), config:currentConfig() }),
      }, "Save craft query");
      setSavedQueries(current => [{ craftQueryId:saved.craftQueryId, name:saveName.trim(), config:currentConfig(), createdAt:saved.createdAt }, ...current]);
      setSelectedQueryId(saved.craftQueryId);
      setSaveOpen(false);
      setSaveName("");
      setSavedMessage("Saved");
      setTimeout(()=>setSavedMessage(""),2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSaving(false); }
  }

  async function deleteSavedQuery() {
    if (!selectedQueryId) return;
    try {
      await requestJson("/api/craft-queries", {
        method:"DELETE",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ craftQueryId:selectedQueryId }),
      }, "Delete craft query");
      setSavedQueries(current=>current.filter(query=>query.craftQueryId!==selectedQueryId));
      setSelectedQueryId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function solve() {
    setSolving(true); setError(""); setResult(null); setExactTraces(null);
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

  async function loadExactTraces() {
    if (!result?.traceKey || matching > 10) return;
    setLoadingTraces(true);
    setError("");
    try {
      const token = await requestJson<{ token: string }>("/api/craft/token", undefined, "Craft token");
      const response = await requestJson<{ traces: SimulationTrace[] }>(`${API}/traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
        body: JSON.stringify({ traceKey: result.traceKey, filters }),
      }, "Exact craft traces");
      setExactTraces(response.traces);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoadingTraces(false);
    }
  }

  const matching = result ? countMatchingJointOutcomes(result.jointOutcomes, preferences, filters) : 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filteredOutcomes = result?.outcomes.filter(outcome => matchesOutcomeMods(outcome.mods, filters)) ?? [];
  const div = result?.prices?.divine ?? 90;

  return (
    <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-5 h-full" style={{ color: "var(--text-primary)" }}>
      <aside className="border-r pr-5 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        <div className="mb-5">
          <p className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--status-info)" }}>Budget optimizer</p>
          <h1 className="text-xl font-semibold mt-1">Build the best item this budget can reach</h1>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1 mb-4">
          <select value={selectedQueryId} onChange={event=>setSelectedQueryId(event.target.value)} style={inputStyle}>
            <option value="">Saved configurations...</option>
            {savedQueries.map(query=><option key={query.craftQueryId} value={query.craftQueryId}>{query.name}</option>)}
          </select>
          <button onClick={loadSavedQuery} disabled={!selectedQueryId} className="px-2 text-xs border rounded disabled:opacity-40" style={{ borderColor:"var(--border)" }}>Load</button>
          <button onClick={deleteSavedQuery} disabled={!selectedQueryId} className="px-2 text-xs border rounded disabled:opacity-40" style={{ borderColor:"var(--border)",color:"var(--status-negative)" }} title="Delete saved configuration">×</button>
        </div>
        <Field label="Item class">
          <select value={classId} onChange={event => changeClass(event.target.value)} style={inputStyle}>
            {data?.classes.map(cls => <option key={cls.id} value={cls.id}>{cls.label}</option>)}
          </select>
        </Field>
        <Field label="Equipment type">
          <select value={baseId} onChange={event => { setBaseId(event.target.value); replacePreferences([]); setStarting({ ...emptyStart, catalystType:"", catalystAmount:0 }); }} style={inputStyle}>
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
        <PreferenceList title="Prefixes" values={prefixes} onChange={replacePreferences} all={preferences}/>
        <PreferenceList title="Suffixes" values={suffixes} onChange={replacePreferences} all={preferences}/>
        <div className="grid grid-cols-[1fr_90px] gap-2 mt-4">
          <input type="number" min={0.01} step={0.1} value={budget} onChange={event => setBudget(Number(event.target.value))} style={inputStyle}/>
          <select value={unit} onChange={event => setUnit(event.target.value as typeof unit)} style={inputStyle}><option value="exalt">Exalts</option><option value="divine">Divines</option></select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
          <button onClick={solve} disabled={solving || !baseId || !preferences.length || budget <= 0} className="py-2.5 rounded-md text-sm font-semibold disabled:opacity-40" style={{ background:"var(--accent)", color:"#fff" }}>{solving ? "Searching and simulating..." : "Optimize craft"}</button>
          <button onClick={()=>setSaveOpen(true)} disabled={!baseId||!preferences.length} className="px-3 border rounded-md text-xs disabled:opacity-40" style={{ borderColor:"var(--border)" }}>Save</button>
        </div>
        {savedMessage&&<p className="text-xs mt-2" style={{ color:"var(--status-positive)" }}>{savedMessage}</p>}
        {error && <p className="text-xs mt-3 p-2 rounded" style={{ color:"var(--status-negative)", background:"#321818" }}>{error}</p>}
      </aside>

      <main className="overflow-y-auto pr-2">
        {!result && <EmptyState solving={solving}/>}
        {result && <>
          <div className="grid grid-cols-4 border-y py-4 mb-5" style={{ borderColor:"var(--border)" }}>
            <Metric label="Expected quality" value={`${result.expectedScore.toFixed(1)} / ${maxScore}`}/>
            <Metric label="Expected spend" value={formatCurrency(result.expectedSpend, div)}/>
            <Metric label="Outcomes simulated" value={result.iterations.toLocaleString()}/>
            <Metric label="Filtered matches" value={`${((matching / result.iterations) * 100).toFixed(1)}%`}/>
          </div>
          <section className="mb-6">
            <div className="flex items-end justify-between mb-3">
              <Header title="Outcome filter" detail="Require any combination of modifiers and minimum tiers."/>
              {activeFilterCount > 0 && <button className="text-xs mb-3" style={{ color:"var(--status-info)" }} onClick={()=>{setFilters({});setExactTraces(null);}}>Clear filter</button>}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {preferences.map(preference => <OutcomeFilterRow key={preference.modId} preference={preference} tiers={eligibleTiers(mods, preference.modId, ilvl)} value={filters[preference.modId] ?? 0} onChange={value=>{setFilters(current=>({...current,[preference.modId]:value}));setExactTraces(null);}}/>)}
              </div>
              <div className="border-l pl-5 flex flex-col justify-center" style={{ borderColor:"var(--border)" }}>
                <p className="text-xs" style={{ color:"var(--text-disabled)" }}>{activeFilterCount ? `${activeFilterCount} required modifier${activeFilterCount === 1 ? "" : "s"}` : "All simulated outcomes"}</p>
                <p className="text-4xl font-semibold mt-1" style={{ color:"var(--status-info)" }}>{((matching/result.iterations)*100).toFixed(1)}%</p>
                <p className="text-xs mt-1" style={{ color:"var(--text-secondary)" }}>{matching.toLocaleString()} of {result.iterations.toLocaleString()} items matched</p>
              </div>
            </div>
            <div className="mt-5">
              <Header title="Matching representative items" detail={filteredOutcomes.length ? "Common observed outcomes satisfying the current filter." : "No representative outcome satisfied this filter."}/>
              <div className="flex flex-col gap-1">{filteredOutcomes.slice(0,12).map(outcome => <OutcomeRow key={outcome.signature} outcome={outcome} total={result.iterations} div={div}/>)}</div>
            </div>
            {matching <= 10 && <div className="mt-5 border-t pt-4" style={{ borderColor:"var(--border)" }}>
              <div className="flex items-start justify-between gap-4">
                <Header title="Exact matched crafts" detail={matching ? "Inspect every final item and the precise action sequence that produced it." : "No simulations matched the current filter."}/>
                {matching > 0 && <button onClick={loadExactTraces} disabled={loadingTraces} className="px-3 py-1.5 border rounded text-xs disabled:opacity-40" style={{ borderColor:"var(--border)" }}>{loadingTraces?"Loading...":exactTraces?"Reload exact matches":"View exact matches"}</button>}
              </div>
              {exactTraces && <div className="flex flex-col gap-2">{exactTraces.map(trace=><ExactTrace key={trace.id} trace={trace} div={div}/>)}</div>}
            </div>}
          </section>
          <section className="mb-6"><Header title="Desired modifier count" detail="How many preferred modifiers appeared on final items, regardless of tier."/><div className="h-52"><ResponsiveContainer><BarChart data={Object.entries(result.desiredModCount).map(([mods,count]) => ({ mods:`${mods} mods`, count }))}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="mods" tick={{ fill:"var(--text-disabled)", fontSize:11 }}/><YAxis tick={{ fill:"var(--text-disabled)", fontSize:11 }}/><Tooltip/><Bar dataKey="count" fill="var(--accent)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></section>
          <section><Header title="Adaptive policy" detail="Most frequently visited decisions and actions."/><div className="grid grid-cols-2 gap-4"><div>{result.policy.slice(0,12).map(decision => <p key={decision.stateKey} className="text-xs py-1.5 border-b" style={{ borderColor:"var(--border)" }}><strong>{decision.actionName}</strong><span style={{ color:"var(--text-disabled)" }}> · {decision.visits} visits</span></p>)}</div><div>{Object.entries(result.actionCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([action,count]) => <p key={action} className="text-xs py-1.5 border-b flex justify-between" style={{ borderColor:"var(--border)" }}><span>{action}</span><strong>{count}</strong></p>)}</div></div></section>
        </>}
      </main>
      {saveOpen&&<SaveQueryModal name={saveName} saving={saving} onName={setSaveName} onSave={saveQuery} onClose={()=>setSaveOpen(false)}/>}
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
function OutcomeFilterRow({ preference, tiers, value, onChange }: { preference:Preference; tiers:number[]; value:number; onChange:(value:number)=>void }) { const enabled=Boolean(value); const anyTier=Math.max(...tiers); return <div className="grid grid-cols-[22px_minmax(0,1fr)_120px] items-center gap-2 py-1.5 border-b" style={{ borderColor:"var(--border)" }}><input type="checkbox" checked={enabled} onChange={event=>onChange(event.target.checked?anyTier:0)} aria-label={`Require ${preference.name}`}/><span className="text-xs truncate" style={{ color:enabled?"var(--text-primary)":"var(--text-disabled)" }}>{preference.name}</span><select value={value||anyTier} disabled={!enabled} onChange={event=>onChange(Number(event.target.value))} style={{...inputStyle,opacity:enabled?1:0.45}}><option value={anyTier}>Any tier</option>{tiers.filter(tier=>tier!==anyTier).map(tier=><option key={tier} value={tier}>T{tier} or better</option>)}</select></div>; }
function OutcomeRow({ outcome,total,div }: { outcome:OutcomeBucket; total:number; div:number }) { return <div className="grid grid-cols-[90px_1fr_100px] gap-3 py-2 border-b text-xs" style={{ borderColor:"var(--border)" }}><strong>{((outcome.count/total)*100).toFixed(1)}%</strong><span>{outcome.mods.length?outcome.mods.map(mod=>`${mod.name} T${mod.tier}`).join(" · "):"No desired modifiers"}</span><span className="text-right" style={{ color:"var(--text-disabled)" }}>{formatCurrency(outcome.spendSum/outcome.count,div)}</span></div>; }
function ExactTrace({ trace,div }:{ trace:SimulationTrace;div:number }) { const mods=[...trace.finalItem.prefixes,...trace.finalItem.suffixes]; return <details className="border rounded" style={{ borderColor:"var(--border)",background:"var(--bg-elevated)" }}><summary className="cursor-pointer px-3 py-2 grid grid-cols-[90px_1fr_110px] gap-3 text-xs"><strong>Item {trace.id}</strong><span>{trace.finalItem.rarity} · {mods.length} affixes · {trace.steps.length} decisions</span><span className="text-right">{formatCurrency(trace.spend,div)}</span></summary><div className="border-t px-3 py-3 grid grid-cols-2 gap-5" style={{ borderColor:"var(--border)" }}><div><p className="text-xs font-semibold mb-2">Final item</p>{mods.length?mods.map(mod=><p key={`${mod.gen_type}-${mod.modId}`} className="text-xs py-1 border-b" style={{ borderColor:"var(--border)" }}><span style={{ color:mod.gen_type==="prefix"?"var(--status-info)":"var(--status-positive)" }}>{mod.gen_type==="prefix"?"P":"S"}</span> · {mod.name} T{mod.tier}{mod.desecrated?" · Desecrated":""}{trace.finalItem.fracturedModIds.includes(mod.modId)?" · Fractured":""}</p>):<p className="text-xs" style={{ color:"var(--text-disabled)" }}>No affixes</p>}</div><div><p className="text-xs font-semibold mb-2">Crafting steps</p>{trace.steps.length?trace.steps.map((step,index)=><div key={`${trace.id}-${index}`} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-2 py-1.5 border-b text-xs" style={{ borderColor:"var(--border)" }}><span style={{ color:"var(--text-disabled)" }}>{index+1}</span><div><p>{step.action}</p>{step.events.length>1&&<p className="mt-0.5 text-[10px]" style={{ color:"var(--text-disabled)" }}>{step.events.map(event=>event.message).join(" → ")}</p>}</div><span style={{ color:"var(--text-disabled)" }}>{Object.entries(step.cost).map(([currency,count])=>`${count} ${currency.replaceAll("_"," ")}`).join(" + ")}</span></div>):<p className="text-xs" style={{ color:"var(--text-disabled)" }}>No crafting actions were needed.</p>}</div></div></details>; }
function SaveQueryModal({ name,saving,onName,onSave,onClose }:{ name:string;saving:boolean;onName:(value:string)=>void;onSave:()=>void;onClose:()=>void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:"rgba(0,0,0,.7)" }} onClick={event=>event.target===event.currentTarget&&onClose()}><div className="w-full max-w-sm border rounded-md p-4" style={{ background:"var(--bg-surface)",borderColor:"var(--border)" }}><h2 className="text-sm font-semibold mb-3">Save craft configuration</h2><input autoFocus placeholder="Configuration name" value={name} onChange={event=>onName(event.target.value)} onKeyDown={event=>event.key==="Enter"&&onSave()} style={inputStyle}/><div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-3 py-1.5 text-xs">Cancel</button><button onClick={onSave} disabled={saving||!name.trim()} className="px-3 py-1.5 text-xs rounded disabled:opacity-40" style={{ background:"var(--accent)",color:"#fff" }}>{saving?"Saving...":"Save"}</button></div></div></div>; }
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
