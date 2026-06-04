"use client";

/** Reusable min/max range input row */
export function MinMaxRow({
  label,
  min, max,
  onMin, onMax,
}: {
  label: string;
  min: number | "";
  max: number | "";
  onMin: (v: number | "") => void;
  onMax: (v: number | "") => void;
}) {
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-base)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    borderRadius: 4,
    fontSize: 12,
    padding: "4px 8px",
    width: "100%",
    outline: "none",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs shrink-0 w-28" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <input
        type="number"
        placeholder="Min"
        value={min}
        onChange={e => onMin(e.target.value === "" ? "" : Number(e.target.value))}
        style={inputStyle}
      />
      <input
        type="number"
        placeholder="Max"
        value={max}
        onChange={e => onMax(e.target.value === "" ? "" : Number(e.target.value))}
        style={inputStyle}
      />
    </div>
  );
}

/** Select dropdown row */
export function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { id: string | null; text: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs shrink-0 w-28" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : e.target.value)}
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          borderRadius: 4,
          fontSize: 12,
          padding: "4px 8px",
          width: "100%",
          outline: "none",
        }}
      >
        {options.map(o => (
          <option key={o.id ?? "__null__"} value={o.id ?? ""}>{o.text}</option>
        ))}
      </select>
    </div>
  );
}

/** Collapsible section */
export function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary
        className="flex items-center justify-between cursor-pointer py-1.5 select-none"
        style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {title}
        <span className="text-xs group-open:rotate-180 transition-transform" style={{ color: "var(--text-disabled)" }}>▼</span>
      </summary>
      <div className="flex flex-col gap-2 pt-2 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        {children}
      </div>
    </details>
  );
}
