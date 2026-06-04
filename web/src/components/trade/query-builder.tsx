"use client";

import { useState } from "react";
import { MinMaxRow, SelectRow, FilterSection } from "./filter-row";
import { StatFilterGroup, type StatGroup } from "./stat-filter";

// ── Static data ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: null,                    text: "Any" },
  { id: "weapon",                text: "Any Weapon" },
  { id: "weapon.onemelee",       text: "Any One-Handed Melee" },
  { id: "weapon.unarmed",        text: "Unarmed" },
  { id: "weapon.claw",           text: "Claw" },
  { id: "weapon.dagger",         text: "Dagger" },
  { id: "weapon.onesword",       text: "One-Handed Sword" },
  { id: "weapon.oneaxe",         text: "One-Handed Axe" },
  { id: "weapon.onemace",        text: "One-Handed Mace" },
  { id: "weapon.spear",          text: "Spear" },
  { id: "weapon.flail",          text: "Flail" },
  { id: "weapon.twomelee",       text: "Any Two-Handed Melee" },
  { id: "weapon.twosword",       text: "Two-Handed Sword" },
  { id: "weapon.twoaxe",         text: "Two-Handed Axe" },
  { id: "weapon.twomace",        text: "Two-Handed Mace" },
  { id: "weapon.warstaff",       text: "Quarterstaff" },
  { id: "weapon.talisman",       text: "Talisman" },
  { id: "weapon.ranged",         text: "Any Ranged" },
  { id: "weapon.bow",            text: "Bow" },
  { id: "weapon.crossbow",       text: "Crossbow" },
  { id: "weapon.caster",         text: "Any Caster Weapon" },
  { id: "weapon.wand",           text: "Wand" },
  { id: "weapon.sceptre",        text: "Sceptre" },
  { id: "weapon.staff",          text: "Staff" },
  { id: "armour",                text: "Any Armour" },
  { id: "armour.helmet",         text: "Helmet" },
  { id: "armour.chest",          text: "Body Armour" },
  { id: "armour.gloves",         text: "Gloves" },
  { id: "armour.boots",          text: "Boots" },
  { id: "armour.quiver",         text: "Quiver" },
  { id: "armour.shield",         text: "Shield" },
  { id: "armour.focus",          text: "Focus" },
  { id: "armour.buckler",        text: "Buckler" },
  { id: "accessory",             text: "Any Accessory" },
  { id: "accessory.amulet",      text: "Amulet" },
  { id: "accessory.belt",        text: "Belt" },
  { id: "accessory.ring",        text: "Ring" },
  { id: "gem",                   text: "Any Gem" },
  { id: "gem.activegem",         text: "Skill Gem" },
  { id: "gem.supportgem",        text: "Support Gem" },
  { id: "jewel",                 text: "Any Jewel" },
  { id: "flask",                 text: "Any Flask" },
  { id: "flask.life",            text: "Life Flask" },
  { id: "flask.mana",            text: "Mana Flask" },
  { id: "map",                   text: "Any Endgame Item" },
  { id: "map.waystone",          text: "Waystone" },
  { id: "currency",              text: "Any Currency" },
  { id: "currency.omen",         text: "Omen" },
  { id: "currency.socketable",   text: "Any Augment" },
  { id: "currency.rune",         text: "Rune" },
  { id: "currency.soulcore",     text: "Soul Core" },
];

const RARITIES = [
  { id: null,           text: "Any" },
  { id: "normal",       text: "Normal" },
  { id: "magic",        text: "Magic" },
  { id: "rare",         text: "Rare" },
  { id: "unique",       text: "Unique" },
  { id: "nonunique",    text: "Any Non-Unique" },
];

const STATUSES = [
  { id: "online",        text: "In Person (Online)" },
  { id: "onlineleague",  text: "In Person (Online in League)" },
  { id: "securable",     text: "Instant Buyout" },
  { id: "available",     text: "Instant Buyout and In Person" },
  { id: "any",           text: "Any" },
];

const LISTED_OPTIONS = [
  { id: null,       text: "Any Time" },
  { id: "1hour",    text: "Up to an Hour Ago" },
  { id: "3hours",   text: "Up to 3 Hours Ago" },
  { id: "12hours",  text: "Up to 12 Hours Ago" },
  { id: "1day",     text: "Up to a Day Ago" },
  { id: "3days",    text: "Up to 3 Days Ago" },
  { id: "1week",    text: "Up to a Week Ago" },
  { id: "2weeks",   text: "Up to 2 Weeks Ago" },
  { id: "1month",   text: "Up to 1 Month Ago" },
];

const PRICE_CURRENCIES = [
  { id: null,             text: "Exalted Orb Equivalent" },
  { id: "divine",         text: "Divine Orb" },
  { id: "exalted",        text: "Exalted Orb" },
  { id: "regal",          text: "Regal Orb" },
  { id: "chaos",          text: "Chaos Orb" },
  { id: "alch",           text: "Orb of Alchemy" },
  { id: "vaal",           text: "Vaal Orb" },
  { id: "annul",          text: "Orb of Annulment" },
  { id: "divine",         text: "Divine Orb" },
  { id: "mirror",         text: "Mirror of Kalandra" },
];

const BOOL_OPTIONS = [
  { id: null,    text: "Any" },
  { id: "true",  text: "Yes" },
  { id: "false", text: "No" },
];

const SORT_OPTIONS = [
  { id: "price",  text: "Price (ascending)" },
  { id: "-price", text: "Price (descending)" },
];

// ── State types ───────────────────────────────────────────────────────────────

interface MM { min: number | ""; max: number | "" }
function mm(): MM { return { min: "", max: "" }; }

interface QueryState {
  // Status
  status: string;
  // Type
  name: string;
  type: string;
  category: string | null;
  rarity: string | null;
  // Equipment
  eq: { damage: MM; aps: MM; crit: MM; dps: MM; pdps: MM; edps: MM; ar: MM; ev: MM; es: MM; ward: MM; block: MM; spirit: MM; rune_sockets: MM; reload_time: MM };
  // Requirements
  req: { lvl: MM; str: MM; dex: MM; int: MM };
  // Misc
  misc: { ilvl: MM; gem_level: MM; quality: MM; corrupted: string | null; identified: string | null; fractured: string | null; desecrated: string | null; mirrored: string | null; veiled: string | null };
  // Trade
  trade: { priceMin: number | ""; priceMax: number | ""; priceCurrency: string | null; indexed: string | null; account: string };
  // Sort
  sort: string;
  // Stats
  statGroups: StatGroup[];
}

function defaultState(): QueryState {
  return {
    status: "online",
    name: "", type: "",
    category: null, rarity: null,
    eq: { damage: mm(), aps: mm(), crit: mm(), dps: mm(), pdps: mm(), edps: mm(), ar: mm(), ev: mm(), es: mm(), ward: mm(), block: mm(), spirit: mm(), rune_sockets: mm(), reload_time: mm() },
    req: { lvl: mm(), str: mm(), dex: mm(), int: mm() },
    misc: { ilvl: mm(), gem_level: mm(), quality: mm(), corrupted: null, identified: null, fractured: null, desecrated: null, mirrored: null, veiled: null },
    trade: { priceMin: "", priceMax: "", priceCurrency: null, indexed: null, account: "" },
    sort: "price",
    statGroups: [{ type: "and", filters: [{ id: "", min: "", max: "", disabled: false }] }],
  };
}

// ── Build GGG query ───────────────────────────────────────────────────────────

function buildMM(mm: MM): object | undefined {
  if (mm.min === "" && mm.max === "") return undefined;
  return { ...(mm.min !== "" ? { min: mm.min } : {}), ...(mm.max !== "" ? { max: mm.max } : {}) };
}

function buildFilters(obj: Record<string, MM | (string | null)>, isMM: boolean) {
  const out: Record<string, object> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isMM) {
      const r = buildMM(v as MM);
      if (r) out[k] = r;
    } else {
      if (v !== null) out[k] = { option: v };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildGGGQuery(q: QueryState): object {
  const type_filters: Record<string, object> = {};
  if (q.category !== null) type_filters.category = { option: q.category };
  if (q.rarity !== null)   type_filters.rarity   = { option: q.rarity };

  const eq: Record<string, MM> = q.eq;
  const eqFilters = buildFilters(eq as any, true);

  const reqFilters = buildFilters(q.req as any, true);

  const miscMM  = { ilvl: q.misc.ilvl, gem_level: q.misc.gem_level, quality: q.misc.quality };
  const miscOpt = { corrupted: q.misc.corrupted, identified: q.misc.identified, fractured_item: q.misc.fractured, desecrated: q.misc.desecrated, mirrored: q.misc.mirrored, veiled: q.misc.veiled };
  const miscMMF = buildFilters(miscMM as any, true) ?? {};
  const miscOptF = buildFilters(miscOpt as any, false) ?? {};
  const miscFilters = { ...miscMMF, ...miscOptF };

  const tradeFilters: Record<string, object> = {};
  if (q.trade.priceMin !== "" || q.trade.priceMax !== "") {
    tradeFilters.price = {
      ...(q.trade.priceMin !== "" ? { min: q.trade.priceMin } : {}),
      ...(q.trade.priceMax !== "" ? { max: q.trade.priceMax } : {}),
      ...(q.trade.priceCurrency ? { option: q.trade.priceCurrency } : {}),
    };
  }
  if (q.trade.indexed) tradeFilters.indexed = { option: q.trade.indexed };
  if (q.trade.account) tradeFilters.account = { input: q.trade.account };

  const stats = q.statGroups
    .filter(g => g.filters.some(f => f.id))
    .map(g => ({
      type: g.type,
      ...(g.type === "count" ? { value: buildMM({ min: g.valueMin ?? "", max: g.valueMax ?? "" }) } : {}),
      filters: g.filters
        .filter(f => f.id)
        .map(f => ({
          id: f.id,
          disabled: f.disabled,
          value: buildMM({ min: f.min, max: f.max }),
        })),
    }));

  const filters: Record<string, object> = {};
  if (Object.keys(type_filters).length) filters.type_filters = { filters: type_filters };
  if (eqFilters)   filters.equipment_filters = { filters: eqFilters };
  if (reqFilters)  filters.req_filters       = { filters: reqFilters };
  if (Object.keys(miscFilters).length) filters.misc_filters = { filters: miscFilters };
  if (Object.keys(tradeFilters).length) filters.trade_filters = { filters: tradeFilters };

  return {
    query: {
      status: { option: q.status },
      ...(q.name ? { name: q.name } : {}),
      ...(q.type ? { type: q.type } : {}),
      filters,
      stats,
    },
    sort: q.sort === "-price" ? { price: "desc" } : { price: "asc" },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onSearch: (gggQuery: object) => void;
  loading: boolean;
}

export function QueryBuilder({ onSearch, loading }: Props) {
  const [q, setQ] = useState<QueryState>(defaultState);

  function upd<K extends keyof QueryState>(key: K, val: QueryState[K]) {
    setQ(prev => ({ ...prev, [key]: val }));
  }

  function updEq(key: keyof QueryState["eq"], field: "min" | "max", val: number | "") {
    setQ(prev => ({ ...prev, eq: { ...prev.eq, [key]: { ...prev.eq[key], [field]: val } } }));
  }
  function updReq(key: keyof QueryState["req"], field: "min" | "max", val: number | "") {
    setQ(prev => ({ ...prev, req: { ...prev.req, [key]: { ...prev.req[key], [field]: val } } }));
  }
  function updMiscMM(key: "ilvl" | "gem_level" | "quality", field: "min" | "max", val: number | "") {
    setQ(prev => ({ ...prev, misc: { ...prev.misc, [key]: { ...(prev.misc[key] as MM), [field]: val } } }));
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 4, fontSize: 12,
    padding: "5px 8px", width: "100%", outline: "none",
  };

  return (
    <div className="flex flex-col gap-1 overflow-y-auto">

      {/* Status */}
      <div className="pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <SelectRow label="Status" value={q.status} options={STATUSES} onChange={v => upd("status", v ?? "online")} />
      </div>

      {/* Type Filters */}
      <FilterSection title="Type Filters" defaultOpen>
        <div className="flex gap-2">
          <input placeholder="Name" value={q.name} onChange={e => upd("name", e.target.value)} style={inputStyle} />
          <input placeholder="Base" value={q.type} onChange={e => upd("type", e.target.value)} style={inputStyle} />
        </div>
        <SelectRow label="Category" value={q.category} options={CATEGORIES} onChange={v => upd("category", v)} />
        <SelectRow label="Rarity" value={q.rarity} options={RARITIES} onChange={v => upd("rarity", v)} />
      </FilterSection>

      {/* Equipment */}
      <FilterSection title="Equipment Filters">
        <MinMaxRow label="Damage"      min={q.eq.damage.min}      max={q.eq.damage.max}      onMin={v => updEq("damage","min",v)}      onMax={v => updEq("damage","max",v)} />
        <MinMaxRow label="DPS"         min={q.eq.dps.min}         max={q.eq.dps.max}         onMin={v => updEq("dps","min",v)}         onMax={v => updEq("dps","max",v)} />
        <MinMaxRow label="Physical DPS"min={q.eq.pdps.min}        max={q.eq.pdps.max}        onMin={v => updEq("pdps","min",v)}        onMax={v => updEq("pdps","max",v)} />
        <MinMaxRow label="Elemental DPS"min={q.eq.edps.min}       max={q.eq.edps.max}        onMin={v => updEq("edps","min",v)}        onMax={v => updEq("edps","max",v)} />
        <MinMaxRow label="Attacks/sec" min={q.eq.aps.min}         max={q.eq.aps.max}         onMin={v => updEq("aps","min",v)}         onMax={v => updEq("aps","max",v)} />
        <MinMaxRow label="Crit Chance" min={q.eq.crit.min}        max={q.eq.crit.max}        onMin={v => updEq("crit","min",v)}        onMax={v => updEq("crit","max",v)} />
        <MinMaxRow label="Reload Time" min={q.eq.reload_time.min} max={q.eq.reload_time.max} onMin={v => updEq("reload_time","min",v)} onMax={v => updEq("reload_time","max",v)} />
        <MinMaxRow label="Armour"      min={q.eq.ar.min}          max={q.eq.ar.max}          onMin={v => updEq("ar","min",v)}          onMax={v => updEq("ar","max",v)} />
        <MinMaxRow label="Evasion"     min={q.eq.ev.min}          max={q.eq.ev.max}          onMin={v => updEq("ev","min",v)}          onMax={v => updEq("ev","max",v)} />
        <MinMaxRow label="Energy Shield"min={q.eq.es.min}         max={q.eq.es.max}          onMin={v => updEq("es","min",v)}          onMax={v => updEq("es","max",v)} />
        <MinMaxRow label="Runic Ward"  min={q.eq.ward.min}        max={q.eq.ward.max}        onMin={v => updEq("ward","min",v)}        onMax={v => updEq("ward","max",v)} />
        <MinMaxRow label="Block"       min={q.eq.block.min}       max={q.eq.block.max}       onMin={v => updEq("block","min",v)}       onMax={v => updEq("block","max",v)} />
        <MinMaxRow label="Spirit"      min={q.eq.spirit.min}      max={q.eq.spirit.max}      onMin={v => updEq("spirit","min",v)}      onMax={v => updEq("spirit","max",v)} />
        <MinMaxRow label="Aug. Sockets"min={q.eq.rune_sockets.min}max={q.eq.rune_sockets.max}onMin={v => updEq("rune_sockets","min",v)} onMax={v => updEq("rune_sockets","max",v)} />
      </FilterSection>

      {/* Requirements */}
      <FilterSection title="Requirements">
        <MinMaxRow label="Level"       min={q.req.lvl.min} max={q.req.lvl.max} onMin={v => updReq("lvl","min",v)} onMax={v => updReq("lvl","max",v)} />
        <MinMaxRow label="Strength"    min={q.req.str.min} max={q.req.str.max} onMin={v => updReq("str","min",v)} onMax={v => updReq("str","max",v)} />
        <MinMaxRow label="Dexterity"   min={q.req.dex.min} max={q.req.dex.max} onMin={v => updReq("dex","min",v)} onMax={v => updReq("dex","max",v)} />
        <MinMaxRow label="Intelligence"min={q.req.int.min} max={q.req.int.max} onMin={v => updReq("int","min",v)} onMax={v => updReq("int","max",v)} />
      </FilterSection>

      {/* Misc */}
      <FilterSection title="Miscellaneous">
        <MinMaxRow label="Item Level"  min={(q.misc.ilvl as MM).min} max={(q.misc.ilvl as MM).max} onMin={v => updMiscMM("ilvl","min",v)} onMax={v => updMiscMM("ilvl","max",v)} />
        <MinMaxRow label="Gem Level"   min={(q.misc.gem_level as MM).min} max={(q.misc.gem_level as MM).max} onMin={v => updMiscMM("gem_level","min",v)} onMax={v => updMiscMM("gem_level","max",v)} />
        <MinMaxRow label="Quality"     min={(q.misc.quality as MM).min} max={(q.misc.quality as MM).max} onMin={v => updMiscMM("quality","min",v)} onMax={v => updMiscMM("quality","max",v)} />
        <SelectRow label="Corrupted"   value={q.misc.corrupted}  options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, corrupted: v } }))} />
        <SelectRow label="Identified"  value={q.misc.identified} options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, identified: v } }))} />
        <SelectRow label="Fractured"   value={q.misc.fractured}  options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, fractured: v } }))} />
        <SelectRow label="Desecrated"  value={q.misc.desecrated} options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, desecrated: v } }))} />
        <SelectRow label="Mirrored"    value={q.misc.mirrored}   options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, mirrored: v } }))} />
        <SelectRow label="Unrevealed"  value={q.misc.veiled}     options={BOOL_OPTIONS} onChange={v => setQ(p => ({ ...p, misc: { ...p.misc, veiled: v } }))} />
      </FilterSection>

      {/* Trade */}
      <FilterSection title="Trade Filters">
        <div>
          <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Price</span>
          <div className="flex gap-1 items-center">
            <input type="number" placeholder="Min" value={q.trade.priceMin} onChange={e => setQ(p => ({ ...p, trade: { ...p.trade, priceMin: e.target.value === "" ? "" : Number(e.target.value) } }))} style={{ ...inputStyle, width: 60 }} />
            <input type="number" placeholder="Max" value={q.trade.priceMax} onChange={e => setQ(p => ({ ...p, trade: { ...p.trade, priceMax: e.target.value === "" ? "" : Number(e.target.value) } }))} style={{ ...inputStyle, width: 60 }} />
            <select value={q.trade.priceCurrency ?? ""} onChange={e => setQ(p => ({ ...p, trade: { ...p.trade, priceCurrency: e.target.value || null } }))} style={{ ...inputStyle, flex: 1 }}>
              {PRICE_CURRENCIES.map(c => <option key={c.id ?? "__null__"} value={c.id ?? ""}>{c.text}</option>)}
            </select>
          </div>
        </div>
        <SelectRow label="Listed" value={q.trade.indexed} options={LISTED_OPTIONS} onChange={v => setQ(p => ({ ...p, trade: { ...p.trade, indexed: v } }))} />
        <div>
          <span className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>Account Name</span>
          <input placeholder="Seller account…" value={q.trade.account} onChange={e => setQ(p => ({ ...p, trade: { ...p.trade, account: e.target.value } }))} style={inputStyle} />
        </div>
      </FilterSection>

      {/* Stat Filters */}
      <FilterSection title="Stat Filters" defaultOpen>
        <div className="flex flex-col gap-2">
          {q.statGroups.map((g, i) => (
            <StatFilterGroup
              key={i}
              group={g}
              index={i}
              onChange={updated => setQ(p => ({ ...p, statGroups: p.statGroups.map((sg, idx) => idx === i ? updated : sg) }))}
              onRemove={() => setQ(p => ({ ...p, statGroups: p.statGroups.filter((_, idx) => idx !== i) }))}
            />
          ))}
          <button
            onClick={() => setQ(p => ({ ...p, statGroups: [...p.statGroups, { type: "and", filters: [{ id: "", min: "", max: "", disabled: false }] }] }))}
            className="text-xs py-1.5 cursor-pointer"
            style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4 }}
          >
            + Add stat group
          </button>
        </div>
      </FilterSection>

      {/* Sort + Actions */}
      <div className="pt-3 flex flex-col gap-2">
        <SelectRow label="Sort" value={q.sort} options={SORT_OPTIONS} onChange={v => upd("sort", v ?? "price")} />
        <div className="flex gap-2">
          <button
            onClick={() => setQ(defaultState())}
            className="flex-1 py-2 rounded text-xs cursor-pointer"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Reset
          </button>
          <button
            onClick={() => onSearch(buildGGGQuery(q))}
            disabled={loading}
            className="flex-2 py-2 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff", flex: 2, border: "none" }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>
    </div>
  );
}
