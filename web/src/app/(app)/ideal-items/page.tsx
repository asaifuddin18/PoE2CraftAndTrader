"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModTier {
  tier:   number;
  ilvl:   number;
  weight: number;
  values: (number | number[])[];
}

interface ModDef {
  modId:     string;
  name:      string;
  affix:     "prefix" | "suffix";
  modgroups: string[];
  tags:      string[];
  statId:    string | null;
  tiers:     ModTier[];
}

interface BaseItem {
  name:      string;
  dropLevel: number;
}

interface ClassDef {
  id:      string;
  label:   string;
  baseIds: string[];
}

interface ItemData {
  classes:   ClassDef[];
  baseItems: Record<string, BaseItem[]>;
  mods:      Record<string, ModDef[]>;
}

export interface TargetMod {
  statId:    string | null;
  modId:     string;
  label:     string;
  affix:     "prefix" | "suffix";
  tier:      number;        // target tier (1 = best)
  tierRange: [number, number] | null; // value range for selected tier
  minTier:   number | "";   // lowest acceptable tier (e.g. 3 = T1/T2/T3 all ok)
  required:  boolean;
}

export interface IdealItem {
  idealId:    string;
  name:       string;
  classId:    string;
  baseId:     string;
  itemBase:   string;
  ilvl:       number;
  targetMods: TargetMod[];
  updatedAt:  string;
}

// ── Data loader ───────────────────────────────────────────────────────────────

let dataCache: ItemData | null = null;
async function loadItemData(): Promise<ItemData> {
  if (dataCache) return dataCache;
  const res = await fetch("/ideal-item-data.json");
  dataCache = await res.json();
  return dataCache!;
}

function fmtVal(v: number | number[]): string {
  if (Array.isArray(v)) return `${v[0]}–${v[1]}`;
  return String(v);
}

function tierLabel(tier: ModTier): string {
  const vals = tier.values.map(fmtVal).join(" / ");
  return `T${tier.tier}  ilvl ${tier.ilvl}+  [${vals}]  w=${tier.weight}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTierRange(tier: ModTier): [number, number] | null {
  const v = tier.values[0];
  if (v == null) return null;
  return Array.isArray(v) ? [v[0] as number, v[1] as number] : [v as number, v as number];
}

function eligibleTiers(mod: ModDef, ilvl: number) {
  return mod.tiers.filter(t => t.ilvl <= ilvl && t.weight > 0);
}

// ── Portal dropdown ───────────────────────────────────────────────────────────
// Renders outside the modal DOM to avoid clipping by overflow:hidden/auto.

function PortalDropdown({ anchorRef, open, children }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open:      boolean;
  children:  React.ReactNode;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open, anchorRef]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={{
      position: "fixed",
      top: pos.top, left: pos.left, width: pos.width,
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 4, maxHeight: 220, overflowY: "auto", zIndex: 9999,
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    }}>
      {children}
    </div>,
    document.body
  );
}

// ── Mod search dropdown ───────────────────────────────────────────────────────

function ModDropdown({ baseId, ilvl, selected, onSelect, disabledAffixes, selectedModIds }: {
  baseId:          string;
  ilvl:            number;
  selected:        TargetMod | null;
  onSelect:        (mod: TargetMod) => void;
  disabledAffixes: Set<"prefix" | "suffix">; // affixes at limit — hide from results
  selectedModIds:  Set<string>;              // already-chosen mod IDs — hide from results
}) {
  const [q, setQ]       = useState("");
  const [mods, setMods] = useState<ModDef[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef         = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItemData().then(d => {
      setMods((d.mods[baseId] ?? []).filter(m => eligibleTiers(m, ilvl).length > 0));
    });
  }, [baseId, ilvl]);

  // Hide mods that: are at the affix limit, or already selected elsewhere, or duplicates
  // Always keep the currently-selected mod visible so the user can change their mind
  const available = mods.filter(m =>
    m.modId === selected?.modId ||
    (!disabledAffixes.has(m.affix as "prefix" | "suffix") && !selectedModIds.has(m.modId))
  );
  const filtered = q.length >= 1
    ? available.filter(m => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
    : available.slice(0, 20);

  useEffect(() => {
    function h(e: MouseEvent) {
      const target = e.target as Node;
      // Close if clicking outside both the wrapper and the portal dropdown
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function pickMod(mod: ModDef) {
    const tiers = eligibleTiers(mod, ilvl);
    const best  = tiers[0];
    onSelect({
      statId:    mod.statId,
      modId:     mod.modId,
      label:     mod.name,
      affix:     mod.affix,
      tier:      1,
      tierRange: best ? getTierRange(best) : null,
      minTier:   "",
      required:  true,
    });
    setQ("");
    setOpen(false);
  }

  const inp: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 4, fontSize: 12,
    padding: "5px 8px", width: "100%", outline: "none", boxSizing: "border-box",
  };

  return (
    <div ref={wrapRef} style={{ flex: 1 }}>
      {/* Show selected mod name as coloured text when not actively searching */}
      {selected && !q && !open ? (
        <div
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }}
          style={{
            ...inp, cursor: "text",
            color: "var(--status-info)", fontStyle: "normal",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "var(--bg-elevated)", color: "var(--text-disabled)", flexShrink: 0 }}>
            {selected.affix === "prefix" ? "P" : "S"}
          </span>
          {selected.label}
        </div>
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          placeholder={selected?.label ?? "Search mods…"}
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (!q) setOpen(false); }}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          style={{ ...inp }}
          autoFocus={!!selected}
        />
      )}
      <PortalDropdown anchorRef={inputRef as React.RefObject<HTMLElement>} open={open && filtered.length > 0}>
        {filtered.map(m => {
          const tiers  = eligibleTiers(m, ilvl);
          const best   = tiers[0];
          const range  = best ? getTierRange(best) : null;
          const rangeStr = range ? ` [${fmtVal(range)}]` : "";
          return (
            <button key={m.modId} onMouseDown={e => { e.preventDefault(); pickMod(m); }}
              className="w-full text-left px-2 py-1.5 cursor-pointer"
              style={{ display: "block", background: "none", border: "none", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{m.name}</span>
              <span style={{ fontSize: 10, color: "var(--text-disabled)", marginLeft: 6 }}>
                {m.affix === "prefix" ? "P" : "S"}{rangeStr}
                {tiers.length > 1 && ` · T1–T${tiers.length}`}
              </span>
            </button>
          );
        })}
      </PortalDropdown>
    </div>
  );
}

// ── Tier selector ─────────────────────────────────────────────────────────────

function TierSelector({ mod, baseId, ilvl, onChangeTier, onChangeMinTier, onChangeRequired }: {
  mod:              TargetMod;
  baseId:           string;
  ilvl:             number;
  onChangeTier:     (tier: number, range: [number, number] | null) => void;
  onChangeMinTier:  (v: number | "") => void;
  onChangeRequired: (v: boolean) => void;
}) {
  const [tiers, setTiers] = useState<ModTier[]>([]);

  useEffect(() => {
    loadItemData().then(d => {
      const modDef = (d.mods[baseId] ?? []).find(m => m.modId === mod.modId);
      if (modDef) setTiers(eligibleTiers(modDef, ilvl));
    });
  }, [baseId, ilvl, mod.modId]);

  const lbl: React.CSSProperties = { fontSize: 10, color: "var(--text-secondary)", display: "block", marginBottom: 2 };
  const sel: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 4, fontSize: 11,
    padding: "4px 6px", outline: "none",
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Tier dropdown */}
      <div>
        <label style={lbl}>Tier</label>
        <select value={mod.tier}
          onChange={e => {
            const t = parseInt(e.target.value);
            const tierDef = tiers.find(x => x.tier === t);
            onChangeTier(t, tierDef ? getTierRange(tierDef) : null);
          }}
          style={sel}>
          {tiers.map(t => (
            <option key={t.tier} value={t.tier}>
              T{t.tier} — {fmtVal(getTierRange(t) ?? t.values[0] as number)} (ilvl {t.ilvl}+)
            </option>
          ))}
        </select>
      </div>

      {/* Selected tier range info */}
      {mod.tierRange && (
        <div style={{ marginTop: 14 }}>
          <span className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 11 }}>
            {fmtVal(mod.tierRange)}
          </span>
        </div>
      )}

      {/* Min tier: lowest acceptable tier (e.g. T3 means T1/T2/T3 all ok) */}
      {tiers.length > 1 && (
        <div>
          <label style={lbl}>Min tier</label>
          <select
            value={mod.minTier === "" ? "" : mod.minTier}
            onChange={e => onChangeMinTier(e.target.value === "" ? "" : Number(e.target.value))}
            style={sel}
          >
            <option value="">same as target</option>
            {tiers.filter(t => t.tier >= mod.tier).map(t => (
              <option key={t.tier} value={t.tier}>
                T{t.tier} — {fmtVal(getTierRange(t) ?? t.values[0] as number)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Required toggle */}
      <label className="flex items-center gap-1.5 cursor-pointer" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={mod.required}
          onChange={e => onChangeRequired(e.target.checked)}
          style={{ accentColor: "var(--accent)" }} />
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Required</span>
      </label>
    </div>
  );
}

// ── Editor modal ──────────────────────────────────────────────────────────────

const EMPTY = (): Omit<IdealItem, "idealId" | "updatedAt"> => ({
  name: "", classId: "accessory.ring", baseId: "1", itemBase: "", ilvl: 84, targetMods: [],
});

function EditorModal({ initial, onSave, onClose }: {
  initial: Partial<IdealItem> | null;
  onSave:  (data: Omit<IdealItem, "idealId" | "updatedAt">) => void;
  onClose: () => void;
}) {
  const [form, setForm]   = useState<Omit<IdealItem, "idealId"|"updatedAt">>(() => ({
    ...EMPTY(),
    ...(initial ?? {}),
    targetMods: (initial?.targetMods ?? []).map(m => ({ ...m })),
  }));
  const [classes, setClasses]   = useState<ClassDef[]>([]);
  const [baseItems, setBaseItems] = useState<BaseItem[]>([]);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    loadItemData().then(d => setClasses(d.classes));
  }, []);

  // Load base items when class changes
  useEffect(() => {
    loadItemData().then(d => {
      const cls = d.classes.find(c => c.id === form.classId);
      if (!cls) return;
      const firstBase = cls.baseIds[0];
      const items = d.baseItems[firstBase] ?? [];
      setBaseItems(items);
      // Auto-set baseId to first in class
      if (!cls.baseIds.includes(form.baseId)) {
        setForm(f => ({ ...f, baseId: firstBase, itemBase: items[0]?.name ?? "" }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classId]);

  function updMod(i: number, field: keyof TargetMod, val: unknown) {
    setForm(f => ({
      ...f,
      targetMods: f.targetMods.map((m, idx) => idx === i ? { ...m, [field]: val } : m),
    }));
  }

  // Only count rows where a mod has actually been selected — blank rows don't count
  const prefixCount = form.targetMods.filter(m => m.modId && m.affix === "prefix").length;
  const suffixCount = form.targetMods.filter(m => m.modId && m.affix === "suffix").length;
  const selectedModIds = new Set(form.targetMods.filter(m => m.modId).map(m => m.modId));

  function addMod() {
    if (form.targetMods.length >= 6) return;
    setForm(f => ({
      ...f,
      targetMods: [...f.targetMods, { statId: null, modId: "", label: "", affix: "prefix", tier: 1, tierRange: null, minTier: "", required: true }],
    }));
  }

  function removeMod(i: number) {
    setForm(f => ({ ...f, targetMods: f.targetMods.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const sel: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 6, fontSize: 13,
    padding: "7px 10px", width: "100%", outline: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 };
  const numIn: React.CSSProperties = { ...sel, width: 80, textAlign: "center" as const, padding: "7px 6px" };

  // Get base items for the current class
  const cls = classes.find(c => c.id === form.classId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl border w-full max-w-2xl flex flex-col max-h-[92vh]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {initial?.idealId ? "Edit Ideal Item" : "New Ideal Item"}
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-disabled)", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* Name */}
          <div>
            <label style={lbl}>Name</label>
            <input autoFocus placeholder="e.g. BIS Life Ring" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={sel} />
          </div>

          {/* Class + Base + iLvl */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={lbl}>Item Class</label>
              <select value={form.classId}
                onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}
                style={sel}>
                {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Base Type</label>
              <select value={form.itemBase}
                onChange={e => setForm(f => ({ ...f, itemBase: e.target.value }))}
                style={sel}>
                {baseItems.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Item Level</label>
              <input type="number" min={1} max={100} value={form.ilvl}
                onChange={e => setForm(f => ({ ...f, ilvl: Math.max(1, Math.min(100, parseInt(e.target.value) || 84)) }))}
                style={sel} />
            </div>
          </div>

          {/* Target mods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <label style={{ ...lbl, marginBottom: 0 }}>Target Mods ({form.targetMods.length}/6)</label>
                <span className="text-xs" style={{ color: prefixCount >= 3 ? "var(--status-warning)" : "var(--text-disabled)" }}>
                  P: {prefixCount}/3
                </span>
                <span className="text-xs" style={{ color: suffixCount >= 3 ? "var(--status-warning)" : "var(--text-disabled)" }}>
                  S: {suffixCount}/3
                </span>
              </div>
              <button onClick={addMod} disabled={form.targetMods.length >= 6}
                className="text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-40"
                style={{ color: "var(--accent)", background: "none", border: "1px solid var(--accent)" }}>
                + Add mod
              </button>
            </div>

            {form.targetMods.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--text-disabled)" }}>
                No mods yet — click + Add mod
              </p>
            )}

            <div className="flex flex-col gap-3">
              {form.targetMods.map((mod, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <div className="flex gap-2 items-start mb-2">
                    <ModDropdown
                      baseId={cls?.baseIds[0] ?? form.baseId}
                      ilvl={form.ilvl}
                      selected={mod.modId ? mod : null}
                      disabledAffixes={new Set([
                        ...(prefixCount >= 3 ? ["prefix" as const] : []),
                        ...(suffixCount >= 3 ? ["suffix" as const] : []),
                      ])}
                      selectedModIds={new Set([...selectedModIds].filter(id => id !== mod.modId))}
                      onSelect={selected => {
                        const mods = [...form.targetMods];
                        mods[i] = { ...selected, required: mod.required };
                        setForm(f => ({ ...f, targetMods: mods }));
                      }}
                    />
                    <button onClick={() => removeMod(i)}
                      style={{ color: "var(--text-disabled)", background: "none", border: "none", cursor: "pointer", fontSize: 14, marginTop: 5, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>

                  {mod.modId && (
                    <TierSelector
                      mod={mod}
                      baseId={cls?.baseIds[0] ?? form.baseId}
                      ilvl={form.ilvl}
                      onChangeTier={(tier, tierRange) => {
                        updMod(i, "tier", tier);
                        updMod(i, "tierRange", tierRange);
                        updMod(i, "minTier", ""); // reset min tier when target changes
                      }}
                      onChangeMinTier={v => updMod(i, "minTier", v)}
                      onChangeRequired={v => updMod(i, "required", v)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose}
            className="text-sm px-4 py-2 rounded cursor-pointer"
            style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="text-sm px-4 py-2 rounded cursor-pointer font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ideal item card ───────────────────────────────────────────────────────────

function IdealItemCard({ item, onEdit, onDelete }: {
  item:     IdealItem;
  onEdit:   () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border flex flex-col"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{item.name}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {item.itemBase || item.classId} · ilvl {item.ilvl}
        </p>
      </div>

      <div className="px-4 py-3 flex-1">
        {item.targetMods.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>No mods defined</p>
        ) : (
          <div className="flex flex-col gap-1">
            {item.targetMods.map((mod, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!mod.required && (
                    <span className="shrink-0 text-xs px-1 rounded"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-disabled)", fontSize: 9 }}>opt</span>
                  )}
                  <span className="text-xs px-1 rounded shrink-0"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-disabled)", fontSize: 9 }}>
                    {mod.affix === "prefix" ? "P" : "S"}
                  </span>
                  <p className="text-xs truncate" style={{ color: "var(--status-info)" }}>
                    {mod.label || mod.modId}
                  </p>
                </div>
                <p className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                  T{mod.tier}
                  {mod.tierRange && ` [${fmtVal(mod.tierRange)}]`}
                  {mod.minTier !== "" && mod.minTier !== mod.tier && `–T${mod.minTier}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
        <button onClick={onEdit}
          className="flex-1 text-xs py-1.5 rounded cursor-pointer"
          style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}>
          Edit
        </button>
        <button onClick={onDelete}
          className="text-xs px-3 py-1.5 rounded cursor-pointer"
          style={{ border: "1px solid var(--border)", color: "var(--status-negative)", background: "transparent" }}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IdealItemsPage() {
  const [items, setItems]       = useState<IdealItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<Partial<IdealItem> | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideal-items")
      .then(r => r.json())
      .then(d => { setItems(d.idealItems ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(data: Omit<IdealItem, "idealId" | "updatedAt">) {
    const isEdit = editing !== "new" && (editing as IdealItem)?.idealId;

    if (isEdit) {
      await fetch("/api/ideal-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idealId: (editing as IdealItem).idealId, ...data }),
      });
      setItems(prev => prev.map(item =>
        item.idealId === (editing as IdealItem).idealId
          ? { ...item, ...data, updatedAt: new Date().toISOString() }
          : item
      ));
    } else {
      const res = await fetch("/api/ideal-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const { idealId } = await res.json();
      setItems(prev => [{ idealId, ...data, updatedAt: new Date().toISOString() }, ...prev]);
    }
    setEditing(null);
  }

  async function handleDelete(idealId: string) {
    setDeleting(idealId);
    await fetch("/api/ideal-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idealId }),
    });
    setItems(prev => prev.filter(item => item.idealId !== idealId));
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border h-40 animate-pulse"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ color: "var(--text-primary)" }}>
      {editing !== null && (
        <EditorModal
          initial={editing === "new" ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">Ideal Items</h1>
        <button onClick={() => setEditing("new")}
          className="text-sm px-3 py-1.5 rounded cursor-pointer font-semibold"
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
          + New ideal item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>No ideal items yet.</p>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
            Define the target stats for an item you want to craft or find.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {items.map(item => (
            <IdealItemCard key={item.idealId} item={item}
              onEdit={() => setEditing(item)}
              onDelete={() => !deleting && handleDelete(item.idealId)} />
          ))}
        </div>
      )}
    </div>
  );
}
