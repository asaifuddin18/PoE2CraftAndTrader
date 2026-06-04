"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ItemCard } from "@/components/trade/item-card";
import { isBridgeReady, bridgeSearch, bridgeFetch } from "@/lib/trade-bridge";
import type { ListingRaw } from "@/lib/trade-api";

const DEFAULT_LEAGUE = "Runes of Aldur";

function buildAccountQuery(accountName: string) {
  return {
    query: {
      status: { option: "any" },
      filters: {
        trade_filters: {
          filters: { account: { input: accountName } },
        },
      },
    },
    sort: { price: "asc" },
  };
}

// ── Inline note editor ────────────────────────────────────────────────────────

function NoteEditor({ listingId, initial, onSave }: {
  listingId: string;
  initial: string;
  onSave: (listingId: string, note: string) => void;
}) {
  const [text, setText]     = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [open, setOpen]     = useState(!!initial);
  const ref                 = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [text]);

  async function save() {
    setSaving(true);
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, note: text }),
    });
    onSave(listingId, text);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (!text.trim()) setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 50); }}
        className="w-full text-left text-xs px-3 py-2 border-t cursor-pointer"
        style={{ borderColor: "var(--border)", color: "var(--text-disabled)", background: "transparent" }}
      >
        + Add note
      </button>
    );
  }

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <textarea
        ref={ref}
        rows={2}
        placeholder="Add a note about this listing…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
        style={{
          width: "100%",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          borderRadius: 4,
          fontSize: 12,
          padding: "6px 8px",
          resize: "none",
          outline: "none",
          boxSizing: "border-box",
          minHeight: 52,
        }}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs" style={{ color: "var(--text-disabled)" }}>⌘↵ to save</span>
        <div className="flex gap-1.5">
          {text !== initial && (
            <button
              onClick={() => { setText(initial); if (!initial) setOpen(false); }}
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ color: "var(--text-disabled)", background: "none", border: "none" }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || text === initial}
            className="text-xs px-2.5 py-1 rounded cursor-pointer disabled:opacity-40"
            style={{
              background: saved ? "var(--status-positive)" : "var(--accent)",
              color: "#fff",
              border: "none",
            }}
          >
            {saving ? "…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Listing card with note ────────────────────────────────────────────────────

function ListingWithNote({ listing, note, onSaveNote }: {
  listing: ListingRaw;
  note: string;
  onSaveNote: (id: string, note: string) => void;
}) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <ItemCard
        listing={listing}
        bookmarked={false}
        onBookmark={() => {}}
        onUnbookmark={() => {}}
        showActions={false}
      />
      <NoteEditor
        listingId={listing.id}
        initial={note}
        onSave={onSaveNote}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ListingsPage() {
  const [accountName, setAccountName]   = useState<string | null>(null);
  const [league, setLeague]             = useState(DEFAULT_LEAGUE);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [listings, setListings]         = useState<ListingRaw[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [queryId, setQueryId]           = useState<string | null>(null);
  const [allIds, setAllIds]             = useState<string[]>([]);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);
  const [notes, setNotes]               = useState<Record<string, string>>({});

  // Load settings + notes
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setAccountName(d.poeAccountName ?? "");
        setLeague(d.poeLeague ?? DEFAULT_LEAGUE);
      });

    fetch("/api/notes")
      .then(r => r.json())
      .then(d => {
        const map: Record<string, string> = {};
        for (const [id, val] of Object.entries(d.notes ?? {})) {
          map[id] = (val as { note: string }).note;
        }
        setNotes(map);
      });
  }, []);

  useEffect(() => {
    if (isBridgeReady()) setBridgeActive(true);
    const handler = () => setBridgeActive(true);
    window.addEventListener("poe2:bridge-ready", handler);
    return () => window.removeEventListener("poe2:bridge-ready", handler);
  }, []);

  const fetchListings = useCallback(async (name: string, lgue: string) => {
    setLoading(true);
    setError(null);
    setListings([]);
    setTotalResults(null);
    try {
      const { id, result } = await bridgeSearch(buildAccountQuery(name), lgue) as { id: string; result: string[] };
      setQueryId(id);
      setAllIds(result);
      setTotalResults(result.length);
      if (result.length === 0) return;
      const { result: items } = await bridgeFetch(result.slice(0, 10), id) as { result: ListingRaw[] };
      setListings(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bridgeActive && accountName) fetchListings(accountName, league);
  }, [bridgeActive, accountName, league, fetchListings]);

  async function loadMore() {
    if (!queryId || loadingMore) return;
    setLoadingMore(true);
    const nextIds = allIds.slice(listings.length, listings.length + 10);
    try {
      const { result: items } = await bridgeFetch(nextIds, queryId) as { result: ListingRaw[] };
      setListings(prev => [...prev, ...items]);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }

  function handleSaveNote(listingId: string, note: string) {
    setNotes(prev => ({ ...prev, [listingId]: note }));
  }

  const hasMore = listings.length < (allIds.length ?? 0) && listings.length > 0;

  if (!bridgeActive) {
    return (
      <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
        <p className="font-semibold mb-1">Browser bridge required</p>
        <p style={{ color: "var(--text-secondary)" }}>
          <a href="/settings" style={{ color: "var(--accent)" }}>Go to Settings</a> to install the Tampermonkey script.
        </p>
      </div>
    );
  }

  if (accountName === "") {
    return (
      <div className="text-center py-16" style={{ color: "var(--text-primary)" }}>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>No GGG account name set.</p>
        <p className="text-xs mb-4" style={{ color: "var(--text-disabled)" }}>Add your account name in Settings.</p>
        <a href="/settings" className="text-sm px-4 py-2 rounded inline-block"
          style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}>
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div style={{ color: "var(--text-primary)" }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">My Listings</h1>
          {accountName && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>
              {accountName} · {league}
            </p>
          )}
        </div>
        {accountName && !loading && (
          <button onClick={() => fetchListings(accountName, league)}
            className="text-xs px-3 py-1.5 rounded cursor-pointer"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}>
            Refresh
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
          {error}
        </div>
      )}

      {totalResults !== null && !loading && (
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          {totalResults === 0 ? "No active listings found." : `${totalResults} listing${totalResults !== 1 ? "s" : ""} — showing ${listings.length}`}
        </p>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border h-52 animate-pulse"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} />
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {listings.map(listing => (
              <ListingWithNote
                key={listing.id}
                listing={listing}
                note={notes[listing.id] ?? ""}
                onSaveNote={handleSaveNote}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-6 py-2 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {loadingMore ? "Loading…" : `Load more (${allIds.length - listings.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
