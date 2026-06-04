"use client";

import { useState } from "react";

export interface StatFilter {
  id: string;
  min: number | "";
  max: number | "";
}

export interface TradeQuery {
  category: string;
  ilvlMin: number | "";
  ilvlMax: number | "";
  stats: StatFilter[];
  onlineOnly: boolean;
}

const CATEGORIES = [
  { id: "accessory.ring",   label: "Ring" },
  { id: "accessory.amulet", label: "Amulet" },
  { id: "accessory.belt",   label: "Belt" },
  { id: "armour.helmet",    label: "Helmet" },
  { id: "armour.chest",     label: "Body Armour" },
  { id: "armour.gloves",    label: "Gloves" },
  { id: "armour.boots",     label: "Boots" },
  { id: "armour.shield",    label: "Shield" },
  { id: "armour.focus",     label: "Focus" },
  { id: "armour.buckler",   label: "Buckler" },
  { id: "armour.quiver",    label: "Quiver" },
  { id: "weapon.claw",      label: "Claw" },
  { id: "weapon.dagger",    label: "Dagger" },
  { id: "weapon.wand",      label: "Wand" },
  { id: "weapon.onesword",  label: "One-Handed Sword" },
  { id: "weapon.oneaxe",    label: "One-Handed Axe" },
  { id: "weapon.onemace",   label: "One-Handed Mace" },
  { id: "weapon.sceptre",   label: "Sceptre" },
  { id: "weapon.spear",     label: "Spear" },
  { id: "weapon.flail",     label: "Flail" },
  { id: "weapon.bow",       label: "Bow" },
  { id: "weapon.crossbow",  label: "Crossbow" },
  { id: "weapon.twosword",  label: "Two-Handed Sword" },
  { id: "weapon.twoaxe",    label: "Two-Handed Axe" },
  { id: "weapon.twomace",   label: "Two-Handed Mace" },
  { id: "weapon.warstaff",  label: "Quarterstaff" },
  { id: "weapon.staff",     label: "Staff" },
  { id: "weapon.talisman",  label: "Talisman" },
];

// Common stats with friendly labels
const COMMON_STATS = [
  { id: "explicit.stat_3299347043", label: "+# to maximum Life" },
  { id: "explicit.stat_1050105434", label: "+# to maximum Mana" },
  { id: "explicit.stat_3372524247", label: "+#% to Fire Resistance" },
  { id: "explicit.stat_4220027924", label: "+#% to Cold Resistance" },
  { id: "explicit.stat_1671376347", label: "+#% to Lightning Resistance" },
  { id: "explicit.stat_2923486259", label: "+#% to Chaos Resistance" },
  { id: "explicit.stat_4080418644", label: "+# to Strength" },
  { id: "explicit.stat_3261801346", label: "+# to Dexterity" },
  { id: "explicit.stat_328541901",  label: "+# to Intelligence" },
  { id: "explicit.stat_2715930412", label: "+# to Evasion Rating" },
  { id: "explicit.stat_4052037485", label: "+# to Accuracy Rating" },
];

interface Props {
  onSearch: (query: TradeQuery) => void;
  loading: boolean;
}

function inputStyle(extra = ""): React.CSSProperties {
  return {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    borderRadius: 6,
  };
}

export function QueryBuilder({ onSearch, loading }: Props) {
  const [category, setCategory] = useState("accessory.ring");
  const [ilvlMin, setIlvlMin] = useState<number | "">("");
  const [ilvlMax, setIlvlMax] = useState<number | "">("");
  const [onlineOnly, setOnlineOnly] = useState(true);
  const [stats, setStats] = useState<StatFilter[]>([
    { id: "", min: "", max: "" },
  ]);

  function addStat() {
    setStats(s => [...s, { id: "", min: "", max: "" }]);
  }

  function removeStat(i: number) {
    setStats(s => s.filter((_, idx) => idx !== i));
  }

  function updateStat(i: number, field: keyof StatFilter, val: string) {
    setStats(s => s.map((stat, idx) =>
      idx === i ? { ...stat, [field]: field === "id" ? val : val === "" ? "" : Number(val) } : stat
    ));
  }

  function handleSearch() {
    onSearch({ category, ilvlMin, ilvlMax, stats, onlineOnly });
  }

  const labelStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 12, marginBottom: 4, display: "block" };
  const inputCls = "w-full px-2 py-1.5 text-sm rounded outline-none focus:border-accent";

  return (
    <div className="flex flex-col gap-4">
      {/* Category */}
      <div>
        <label style={labelStyle}>Item Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className={inputCls}
          style={inputStyle()}
        >
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* iLvl */}
      <div>
        <label style={labelStyle}>Item Level</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={ilvlMin}
            onChange={e => setIlvlMin(e.target.value === "" ? "" : Number(e.target.value))}
            className={inputCls}
            style={inputStyle()}
          />
          <input
            type="number"
            placeholder="Max"
            value={ilvlMax}
            onChange={e => setIlvlMax(e.target.value === "" ? "" : Number(e.target.value))}
            className={inputCls}
            style={inputStyle()}
          />
        </div>
      </div>

      {/* Stat filters */}
      <div>
        <label style={labelStyle}>Mod Filters</label>
        <div className="flex flex-col gap-2">
          {stats.map((stat, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex gap-1 items-center">
                <select
                  value={stat.id}
                  onChange={e => updateStat(i, "id", e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs rounded outline-none"
                  style={{ ...inputStyle(), minWidth: 0 }}
                >
                  <option value="">— select stat —</option>
                  {COMMON_STATS.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeStat(i)}
                  className="text-xs px-1.5 py-1 rounded cursor-pointer"
                  style={{ color: "var(--text-disabled)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                >✕</button>
              </div>
              {stat.id && (
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={stat.min}
                    onChange={e => updateStat(i, "min", e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded outline-none"
                    style={inputStyle()}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={stat.max}
                    onChange={e => updateStat(i, "max", e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded outline-none"
                    style={inputStyle()}
                  />
                </div>
              )}
            </div>
          ))}
          <button
            onClick={addStat}
            className="text-xs py-1.5 rounded cursor-pointer text-left px-2"
            style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            + Add filter
          </button>
        </div>
      </div>

      {/* Online only */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={onlineOnly}
          onChange={e => setOnlineOnly(e.target.checked)}
          className="rounded"
          style={{ accentColor: "var(--accent)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Online sellers only</span>
      </label>

      {/* Search */}
      <button
        onClick={handleSearch}
        disabled={loading}
        className="w-full py-2 rounded text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </div>
  );
}
