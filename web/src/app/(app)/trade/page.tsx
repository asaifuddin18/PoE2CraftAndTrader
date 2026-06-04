"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryBuilder, type QueryState } from "@/components/trade/query-builder";
import { ItemCard } from "@/components/trade/item-card";
import { isBridgeReady, bridgeSearch, bridgeFetch } from "@/lib/trade-bridge";
import type { ListingRaw } from "@/lib/trade-api";

const DEFAULT_LEAGUE = "Runes of Aldur";
const PENDING_KEY    = "poe2:pending-query";

export default function TradePage() {
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [listings, setListings]         = useState<ListingRaw[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [queryId, setQueryId]           = useState<string | null>(null);
  const [allIds, setAllIds]             = useState<string[]>([]);
  const [bookmarks, setBookmarks]       = useState<Record<string, ListingRaw>>({});
  const [loadingMore, setLoadingMore]   = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);

  // Saved query state
  const [lastGGGQuery, setLastGGGQuery]     = useState<object | null>(null);
  const [lastQueryState, setLastQueryState] = useState<QueryState | null>(null);
  const [saveOpen, setSaveOpen]             = useState(false);
  const [saveName, setSaveName]             = useState("");
  const [saving, setSaving]                 = useState(false);
  const [savedMsg, setSavedMsg]             = useState("");

  // Pending query from /queries page (set via sessionStorage)
  const [pendingQuery, setPendingQuery] = useState<{ gggQuery: object; queryState: QueryState } | null>(null);
  const [formState, setFormState]       = useState<QueryState | null>(null);

  // Read pending query from sessionStorage on mount
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_KEY);
    try {
      const parsed = JSON.parse(raw) as { gggQuery: object; queryState: QueryState };
      setFormState(parsed.queryState);   // restore form immediately
      setPendingQuery(parsed);           // queue execution for when bridge is ready
    } catch { /* ignore */ }
  }, []);

  // Bridge detection
  useEffect(() => {
    if (isBridgeReady()) setBridgeActive(true);
    const handler = () => setBridgeActive(true);
    window.addEventListener("poe2:bridge-ready", handler);
    return () => window.removeEventListener("poe2:bridge-ready", handler);
  }, []);

  // Execute pending query once bridge is ready
  useEffect(() => {
    if (!bridgeActive || !pendingQuery) return;
    setPendingQuery(null);
    executeSearch(pendingQuery.gggQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeActive, pendingQuery]);

  const executeSearch = useCallback(async (gggQuery: object) => {
    setLoading(true);
    setError(null);
    setListings([]);
    setTotalResults(null);

    try {
      const { id, result } = await bridgeSearch(gggQuery, DEFAULT_LEAGUE) as { id: string; result: string[] };
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

  function handleSearch(gggQuery: object, queryState: QueryState) {
    if (!bridgeActive) return;
    setLastGGGQuery(gggQuery);
    setLastQueryState(queryState);
    executeSearch(gggQuery);
  }

  async function loadMore() {
    if (!queryId || loadingMore || !bridgeActive) return;
    setLoadingMore(true);
    const nextIds = allIds.slice(listings.length, listings.length + 10);
    try {
      const { result: items } = await bridgeFetch(nextIds, queryId) as { result: ListingRaw[] };
      setListings(prev => [...prev, ...items]);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  }

  async function saveQuery() {
    if (!lastGGGQuery || !lastQueryState || !saveName.trim()) return;
    setSaving(true);
    await fetch("/api/queries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:       saveName.trim(),
        gggQuery:   lastGGGQuery,
        queryState: lastQueryState,
      }),
    });
    setSaving(false);
    setSaveOpen(false);
    setSaveName("");
    setSavedMsg("Saved!");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  async function handleBookmark(listing: ListingRaw) {
    setBookmarks(prev => ({ ...prev, [listing.id]: listing }));
    await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, data: listing }),
    }).catch(console.error);
  }

  async function handleUnbookmark(id: string) {
    setBookmarks(prev => { const n = { ...prev }; delete n[id]; return n; });
    await fetch("/api/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: id }),
    }).catch(console.error);
  }

  const hasMore = listings.length < (allIds.length ?? 0) && listings.length > 0;

  return (
    <div className="flex gap-5 h-full" style={{ color: "var(--text-primary)" }}>

      {/* Save query modal */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={e => e.target === e.currentTarget && setSaveOpen(false)}>
          <div className="rounded-xl border p-6 w-80 flex flex-col gap-4"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Save Query</h3>
            <input autoFocus type="text" placeholder="e.g. T1 Life Rings"
              value={saveName} onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveQuery()}
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)",
                borderRadius: 6, padding: "8px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSaveOpen(false)}
                className="text-sm px-4 py-2 rounded cursor-pointer"
                style={{ color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                Cancel
              </button>
              <button onClick={saveQuery} disabled={saving || !saveName.trim()}
                className="text-sm px-4 py-2 rounded cursor-pointer font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left: Query builder */}
      <aside className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0 max-h-[calc(100vh-80px)] overflow-y-auto"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 text-xs"
            style={{ color: bridgeActive ? "var(--status-positive)" : "var(--status-warning)" }}>
            <span>{bridgeActive ? "●" : "○"}</span>
            {bridgeActive
              ? "Bridge active"
              : <span>Bridge off — <a href="/settings" style={{ color: "var(--accent)" }}>install</a></span>}
          </div>
          <div className="flex items-center gap-2">
            {savedMsg && <span className="text-xs" style={{ color: "var(--status-positive)" }}>{savedMsg}</span>}
            {lastGGGQuery && bridgeActive && (
              <button onClick={() => setSaveOpen(true)}
                className="text-xs px-2 py-1 rounded cursor-pointer"
                style={{ color: "var(--accent)", background: "transparent", border: "1px solid var(--accent)" }}>
                Save
              </button>
            )}
          </div>
        </div>
        <QueryBuilder
          onSearch={handleSearch}
          loading={loading}
          initialState={formState}
        />
      </aside>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {!bridgeActive && (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Browser bridge required</p>
            <p style={{ color: "var(--text-secondary)" }}>
              <a href="/settings" style={{ color: "var(--accent)" }}>Go to Settings</a> to install the Tampermonkey script.
            </p>
          </div>
        )}

        {totalResults !== null && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {totalResults} results — showing {listings.length}
            </p>
            {Object.keys(bookmarks).length > 0 && (
              <p className="text-xs" style={{ color: "var(--status-warning)" }}>
                ★ {Object.keys(bookmarks).length} bookmarked
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg p-3 mb-4 text-sm"
            style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
            {error}
          </div>
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
                <ItemCard key={listing.id} listing={listing}
                  bookmarked={!!bookmarks[listing.id]}
                  onBookmark={handleBookmark} onUnbookmark={handleUnbookmark} />
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

        {bridgeActive && !loading && listings.length === 0 && totalResults === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No results found.</p>
          </div>
        )}

        {bridgeActive && !loading && totalResults === null && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--text-disabled)" }}>Set your filters and hit Search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
