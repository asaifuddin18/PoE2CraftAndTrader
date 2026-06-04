"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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
  statId:     string | null;
  modId:      string;
  label:      string;
  affix:      "prefix" | "suffix";
  minRoll:    number | "";
  targetRoll: number | "";
  tierRange:  [number, number] | null; // [min, max] for the best eligible tier
  required:   boolean;
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

// ── Mod search dropdown ───────────────────────────────────────────────────────

function ModDropdown({ baseId, ilvl, selected, onSelect }: {
  baseId: string;
  ilvl:   number;
  selected: TargetMod | null;
  onSelect: (mod: TargetMod) => void;
}) {
  const [q, setQ]         = useState("");
  const [mods, setMods]   = useState<ModDef[]>([]);
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadItemData().then(d => {
      const available = (d.mods[baseId] ?? [])
        .filter(m => m.tiers.some(t => t.ilvl <= ilvl && t.weight > 0));
      setMods(available);
    });
  }, [baseId, ilvl]);

  const filtered = q.length >= 1
    ? mods.filter(m => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20)
    : mods.slice(0, 20);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function pickMod(mod: ModDef) {
    // Best eligible tier at this ilvl
    const eligibleTiers = mod.tiers.filter(t => t.ilvl <= ilvl && t.weight > 0);
    const bestTier      = eligibleTiers[0]; // tiers sorted best first
    const tierRange: [number, number] | null = bestTier?.values[0]
      ? Array.isArray(bestTier.values[0])
        ? [bestTier.values[0][0] as number, bestTier.values[0][1] as number]
        : [bestTier.values[0] as number, bestTier.values[0] as number]
      : null;

    onSelect({
      statId:     mod.statId,
      modId:      mod.modId,
      label:      mod.name,
      affix:      mod.affix,
      minRoll:    "",
      targetRoll: "",
      tierRange,
      required:   true,
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
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <input
        type="text"
        placeholder={selected ? selected.label : "Search mods…"}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        style={{ ...inp, color: selected && !q ? "var(--text-secondary)" : "var(--text-primary)" }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 100, top: "calc(100% + 2px)", left: 0, right: 0,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 4, maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.map(m => {
            const eligible = m.tiers.filter(t => t.ilvl <= ilvl && t.weight > 0);
            const best     = eligible[0];
            const bestVal  = best?.values[0];
            const valStr   = bestVal != null ? ` [${fmtVal(bestVal)}]` : "";
            return (
              <button key={m.modId} onClick={() => pickMod(m)}
                className="w-full text-left px-2 py-1.5 cursor-pointer"
                style={{ display: "block", background: "none", border: "none", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{m.name}</span>
                <span style={{ fontSize: 10, color: "var(--text-disabled)", marginLeft: 6 }}>
                  {m.affix === "prefix" ? "P" : "S"}{valStr}
                  {eligible.length > 1 && ` · T1–T${eligible.length}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
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

  function addMod() {
    if (form.targetMods.length >= 6) return;
    setForm(f => ({
      ...f,
      targetMods: [...f.targetMods, { statId: null, modId: "", label: "", affix: "prefix", minRoll: "", targetRoll: "", tierRange: null, required: true }],
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
              <label style={{ ...lbl, marginBottom: 0 }}>Target Mods ({form.targetMods.length}/6)</label>
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
                    <>
                      {/* Tier range info */}
                      {mod.tierRange && (
                        <p className="text-xs mb-2" style={{ color: "var(--text-disabled)" }}>
                          Best tier at ilvl {form.ilvl}: {fmtVal(mod.tierRange)}
                          {" · "}{mod.affix === "prefix" ? "Prefix" : "Suffix"}
                        </p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div>
                          <label style={{ ...lbl, marginBottom: 2, fontSize: 10 }}>Min acceptable roll</label>
                          <input type="number" placeholder="e.g. 80" value={mod.minRoll}
                            onChange={e => updMod(i, "minRoll", e.target.value === "" ? "" : Number(e.target.value))}
                            style={numIn} />
                        </div>
                        <div>
                          <label style={{ ...lbl, marginBottom: 2, fontSize: 10 }}>Target roll</label>
                          <input type="number" placeholder="e.g. 100" value={mod.targetRoll}
                            onChange={e => updMod(i, "targetRoll", e.target.value === "" ? "" : Number(e.target.value))}
                            style={numIn} />
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer" style={{ marginTop: 16 }}>
                          <input type="checkbox" checked={mod.required}
                            onChange={e => updMod(i, "required", e.target.checked)}
                            style={{ accentColor: "var(--accent)" }} />
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Required</span>
                        </label>
                      </div>
                    </>
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
                  {mod.minRoll !== "" && `≥${mod.minRoll}`}
                  {mod.minRoll !== "" && mod.targetRoll !== "" && " → "}
                  {mod.targetRoll !== "" && `${mod.targetRoll}`}
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
