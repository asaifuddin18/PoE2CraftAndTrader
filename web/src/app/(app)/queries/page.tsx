"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SavedQuery {
  queryId:   string;
  name:      string;
  gggQuery:  object;
  createdAt: string;
  lastRunAt: string | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function QueriesPage() {
  const router = useRouter();
  const [queries, setQueries]     = useState<SavedQuery[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/queries")
      .then(r => r.json())
      .then(d => { setQueries(d.queries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function runQuery(q: SavedQuery) {
    // Encode query as base64 and navigate to trade page
    const encoded = btoa(JSON.stringify(q.gggQuery));
    // Update lastRunAt in background
    fetch("/api/queries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryId: q.queryId }),
    }).catch(console.error);
    router.push(`/trade?q=${encoded}`);
  }

  async function deleteQuery(queryId: string) {
    setDeleting(queryId);
    await fetch("/api/queries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryId }),
    });
    setQueries(prev => prev.filter(q => q.queryId !== queryId));
    setDeleting(null);
  }

  const row: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  };

  const btn = (accent = false): React.CSSProperties => ({
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer",
    border: accent ? "none" : "1px solid var(--border)",
    background: accent ? "var(--accent)" : "transparent",
    color: accent ? "#fff" : "var(--text-secondary)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg animate-pulse h-14"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ color: "var(--text-primary)" }}>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">Saved Queries</h1>
        <button
          onClick={() => router.push("/trade")}
          style={{ ...btn(true) }}
        >
          + New Search
        </button>
      </div>

      {queries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>No saved queries yet.</p>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
            Run a search on the Trade page and click <strong style={{ color: "var(--text-secondary)" }}>Save query</strong>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {queries.map(q => (
            <div key={q.queryId} style={row}>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {q.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>
                  Saved {timeAgo(q.createdAt)}
                  {q.lastRunAt && ` · Last run ${timeAgo(q.lastRunAt)}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => runQuery(q)} style={btn(true)}>
                  ▶ Run
                </button>
                <button
                  onClick={() => deleteQuery(q.queryId)}
                  disabled={deleting === q.queryId}
                  style={{ ...btn(), color: "var(--status-negative)", borderColor: "var(--border)" }}
                >
                  {deleting === q.queryId ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
