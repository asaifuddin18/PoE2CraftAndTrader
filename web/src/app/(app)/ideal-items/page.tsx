"use client";

import { useEffect, useState, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TargetMod {
  statId:    string;
  label:     string;
  minRoll:   number | "";
  targetRoll:number | "";
  required:  boolean;
}

export interface IdealItem {
  idealId:    string;
  name:       string;
  itemClass:  string;
  itemBase:   string;
  ilvl:       number;
  targetMods: TargetMod[];
  updatedAt:  string;
}

// ── Item class options ────────────────────────────────────────────────────────

const ITEM_CLASSES = [
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

// ── Stat search ───────────────────────────────────────────────────────────────

interface StatOption { id: string; text: string; group: string }
let statsCache: StatOption[] | null = null;
async function loadStats(): Promise<StatOption[]> {
  if (statsCache) return statsCache;
  const res = await fetch("/trade-stats.json");
  statsCache = await res.json();
  return statsCache!;
}

function StatSearch({ value, label, onChange }: {
  value: string;
  label: string;
  onChange: (id: string, text: string) => void;
}) {
  const [q, setQ]           = useState("");
  const [results, setResults] = useState<StatOption[]>([]);
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const stats = await loadStats();
      const lower = q.toLowerCase();
      setResults(stats.filter(s => s.text.toLowerCase().includes(lower)).slice(0, 12));
      setOpen(true);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inp: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 4, fontSize: 12,
    padding: "5px 8px", width: "100%", outline: "none", boxSizing: "border-box",
  };

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <input
        type="text"
        placeholder="Search stat…"
        value={value ? (q || label) : q}
        onFocus={() => { if (value) setQ(""); }}
        onChange={e => setQ(e.target.value)}
        style={inp}
      />
      {value && !q && (
        <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 2, lineHeight: 1.3 }}>
          {label}
        </p>
      )}
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 100, top: "calc(100% + 2px)", left: 0, right: 0,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 4, maxHeight: 180, overflowY: "auto",
        }}>
          {results.map(r => (
            <button key={r.id} onClick={() => { onChange(r.id, r.text); setQ(""); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 cursor-pointer"
              style={{ fontSize: 11, color: "var(--text-primary)", display: "block", borderBottom: "1px solid var(--border)", background: "none", border: "none" }}>
              <span style={{ color: "var(--text-disabled)", marginRight: 4 }}>[{r.group}]</span>
              {r.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editor modal ──────────────────────────────────────────────────────────────

const EMPTY_ITEM = (): Omit<IdealItem, "idealId" | "updatedAt"> => ({
  name: "", itemClass: "accessory.ring", itemBase: "", ilvl: 100, targetMods: [],
});

function EditorModal({ initial, onSave, onClose }: {
  initial: Partial<IdealItem> | null;
  onSave: (data: Omit<IdealItem, "idealId" | "updatedAt">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_ITEM(),
    ...(initial ?? {}),
    targetMods: (initial?.targetMods ?? []).map(m => ({ ...m })),
  }));
  const [saving, setSaving] = useState(false);

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
      targetMods: [...f.targetMods, { statId: "", label: "", minRoll: "", targetRoll: "", required: true }],
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

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 6, fontSize: 13,
    padding: "7px 10px", width: "100%", outline: "none", boxSizing: "border-box",
  };
  const numInput: React.CSSProperties = { ...inputStyle, width: 70, textAlign: "center" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl border w-full max-w-xl flex flex-col max-h-[90vh]"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {initial?.idealId ? "Edit Ideal Item" : "New Ideal Item"}
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-disabled)", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* Name */}
          <div>
            <label style={lbl}>Name</label>
            <input placeholder="e.g. BIS Life Ring" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={inputStyle} autoFocus />
          </div>

          {/* Class + Base + iLvl */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label style={lbl}>Item Class</label>
              <select value={form.itemClass} onChange={e => setForm(f => ({ ...f, itemClass: e.target.value }))}
                style={inputStyle}>
                {ITEM_CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <label style={lbl}>Base Type</label>
              <input placeholder="e.g. Gold Ring" value={form.itemBase}
                onChange={e => setForm(f => ({ ...f, itemBase: e.target.value }))}
                style={inputStyle} />
            </div>
            <div className="col-span-1">
              <label style={lbl}>Item Level</label>
              <input type="number" min={1} max={100} value={form.ilvl}
                onChange={e => setForm(f => ({ ...f, ilvl: parseInt(e.target.value) || 100 }))}
                style={inputStyle} />
            </div>
          </div>

          {/* Target mods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...lbl, marginBottom: 0 }}>
                Target Mods ({form.targetMods.length}/6)
              </label>
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
                  {/* Stat search */}
                  <div className="flex gap-2 items-start mb-2">
                    <StatSearch
                      value={mod.statId}
                      label={mod.label}
                      onChange={(id, text) => { updMod(i, "statId", id); updMod(i, "label", text); }}
                    />
                    <button onClick={() => removeMod(i)}
                      style={{ color: "var(--text-disabled)", background: "none", border: "none", cursor: "pointer", fontSize: 14, marginTop: 4, flexShrink: 0 }}>
                      ✕
                    </button>
                  </div>

                  {/* Roll inputs + required toggle */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <label style={{ ...lbl, marginBottom: 2 }}>Min roll</label>
                      <input type="number" placeholder="e.g. 80" value={mod.minRoll}
                        onChange={e => updMod(i, "minRoll", e.target.value === "" ? "" : Number(e.target.value))}
                        style={numInput} />
                    </div>
                    <div>
                      <label style={{ ...lbl, marginBottom: 2 }}>Target roll</label>
                      <input type="number" placeholder="e.g. 100" value={mod.targetRoll}
                        onChange={e => updMod(i, "targetRoll", e.target.value === "" ? "" : Number(e.target.value))}
                        style={numInput} />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer" style={{ marginTop: 16 }}>
                      <input type="checkbox" checked={mod.required}
                        onChange={e => updMod(i, "required", e.target.checked)}
                        style={{ accentColor: "var(--accent)" }} />
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Required</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
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
  item: IdealItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const className = ITEM_CLASSES.find(c => c.id === item.itemClass)?.label ?? item.itemClass;

  return (
    <div className="rounded-lg border flex flex-col"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{item.name}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {className}{item.itemBase ? ` · ${item.itemBase}` : ""} · ilvl {item.ilvl}
        </p>
      </div>

      {/* Mods */}
      <div className="px-4 py-3 flex-1">
        {item.targetMods.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>No mods defined</p>
        ) : (
          <div className="flex flex-col gap-1">
            {item.targetMods.map((mod, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!mod.required && (
                    <span className="text-xs px-1 rounded shrink-0"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-disabled)", fontSize: 9 }}>
                      opt
                    </span>
                  )}
                  <p className="text-xs truncate" style={{ color: "var(--status-info)" }}>
                    {mod.label || mod.statId}
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

      {/* Actions */}
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
  const [editing, setEditing]   = useState<Partial<IdealItem> | null | "new">(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ideal-items")
      .then(r => r.json())
      .then(d => { setItems(d.idealItems ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(data: Omit<IdealItem, "idealId" | "updatedAt">) {
    const isEdit = editing !== "new" && editing?.idealId;

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
            <IdealItemCard
              key={item.idealId}
              item={item}
              onEdit={() => setEditing(item)}
              onDelete={() => !deleting && handleDelete(item.idealId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
