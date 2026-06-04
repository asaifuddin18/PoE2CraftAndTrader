"use client";

import { useState, useEffect, useRef } from "react";

export interface StatFilterEntry {
  id: string;
  min: number | "";
  max: number | "";
  disabled: boolean;
}

export interface StatGroup {
  type: "and" | "if" | "not" | "count";
  filters: StatFilterEntry[];
  valueMin?: number | "";
  valueMax?: number | "";
}

interface StatOption {
  id: string;
  text: string;
  group: string;
}

// Load stats once and cache in module scope
let statsCache: StatOption[] | null = null;
async function loadStats(): Promise<StatOption[]> {
  if (statsCache) return statsCache;
  const res = await fetch("/trade-stats.json");
  statsCache = await res.json();
  return statsCache!;
}

function StatSearch({ value, onChange }: { value: string; onChange: (id: string, text: string) => void }) {
  const [q, setQ] = useState(value ? "" : "");
  const [displayText, setDisplayText] = useState(value ? "" : "");
  const [results, setResults] = useState<StatOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const stats = await loadStats();
      const lower = q.toLowerCase();
      const matches = stats.filter(s => s.text.toLowerCase().includes(lower)).slice(0, 15);
      setResults(matches);
      setOpen(true);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-base)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    borderRadius: 4,
    fontSize: 11,
    padding: "4px 8px",
    width: "100%",
    outline: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="Search stats…"
        value={displayText || q}
        onFocus={() => { setDisplayText(""); setOpen(results.length > 0); }}
        onChange={e => { setQ(e.target.value); setDisplayText(""); }}
        style={inputStyle}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0,
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 4, maxHeight: 200, overflowY: "auto",
        }}>
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => {
                onChange(r.id, r.text);
                setDisplayText(r.text);
                setQ("");
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 cursor-pointer hover:bg-[var(--bg-base)]"
              style={{ fontSize: 11, color: "var(--text-primary)", display: "block", borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--text-disabled)", marginRight: 4 }}>[{r.group}]</span>
              {r.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatFilterGroup({
  group,
  index,
  onChange,
  onRemove,
}: {
  group: StatGroup;
  index: number;
  onChange: (g: StatGroup) => void;
  onRemove: () => void;
}) {
  const [statLabels, setStatLabels] = useState<Record<string, string>>({});

  function updateFilter(i: number, field: keyof StatFilterEntry, val: string | number | boolean) {
    const filters = group.filters.map((f, idx) =>
      idx === i ? { ...f, [field]: val } : f
    );
    onChange({ ...group, filters });
  }

  function addFilter() {
    onChange({ ...group, filters: [...group.filters, { id: "", min: "", max: "", disabled: false }] });
  }

  function removeFilter(i: number) {
    onChange({ ...group, filters: group.filters.filter((_, idx) => idx !== i) });
  }

  const numRow: React.CSSProperties = {
    background: "var(--bg-base)", border: "1px solid var(--border)",
    color: "var(--text-primary)", borderRadius: 4, fontSize: 11,
    padding: "4px 6px", width: 56, outline: "none",
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px" }}>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={group.type}
          onChange={e => onChange({ ...group, type: e.target.value as StatGroup["type"] })}
          style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 4, fontSize: 11, padding: "2px 6px" }}
        >
          <option value="and">And</option>
          <option value="if">If</option>
          <option value="not">Not</option>
          <option value="count">Count</option>
        </select>
        {group.type === "count" && (
          <>
            <input type="number" placeholder="Min" value={group.valueMin ?? ""} onChange={e => onChange({ ...group, valueMin: e.target.value === "" ? "" : Number(e.target.value) })} style={{ ...numRow, width: 48 }} />
            <span style={{ fontSize: 11, color: "var(--text-disabled)" }}>–</span>
            <input type="number" placeholder="Max" value={group.valueMax ?? ""} onChange={e => onChange({ ...group, valueMax: e.target.value === "" ? "" : Number(e.target.value) })} style={{ ...numRow, width: 48 }} />
          </>
        )}
        <button onClick={onRemove} style={{ marginLeft: "auto", color: "var(--text-disabled)", fontSize: 11, cursor: "pointer", background: "none", border: "none" }}>✕ Remove group</button>
      </div>

      {/* Individual filters */}
      <div className="flex flex-col gap-1.5">
        {group.filters.map((f, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex gap-1 items-center">
              <div style={{ flex: 1 }}>
                <StatSearch
                  value={f.id}
                  onChange={(id, text) => {
                    setStatLabels(prev => ({ ...prev, [id]: text }));
                    updateFilter(i, "id", id);
                  }}
                />
                {f.id && statLabels[f.id] && (
                  <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 2 }}>
                    {statLabels[f.id]}
                  </p>
                )}
              </div>
              <button
                onClick={() => updateFilter(i, "disabled", !f.disabled)}
                title={f.disabled ? "Enable" : "Disable"}
                style={{ fontSize: 10, cursor: "pointer", color: f.disabled ? "var(--text-disabled)" : "var(--status-positive)", background: "none", border: "none" }}
              >
                {f.disabled ? "○" : "●"}
              </button>
              <button onClick={() => removeFilter(i)} style={{ fontSize: 11, cursor: "pointer", color: "var(--text-disabled)", background: "none", border: "none" }}>✕</button>
            </div>
            {f.id && (
              <div className="flex gap-1 pl-1">
                <input type="number" placeholder="Min" value={f.min} onChange={e => updateFilter(i, "min", e.target.value === "" ? "" : Number(e.target.value))} style={numRow} />
                <input type="number" placeholder="Max" value={f.max} onChange={e => updateFilter(i, "max", e.target.value === "" ? "" : Number(e.target.value))} style={numRow} />
              </div>
            )}
          </div>
        ))}
        <button
          onClick={addFilter}
          style={{ fontSize: 11, color: "var(--text-secondary)", cursor: "pointer", textAlign: "left", background: "none", border: "none", padding: "2px 0" }}
        >
          + Add filter
        </button>
      </div>
    </div>
  );
}
