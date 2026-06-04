"use client";

import { useState, useEffect } from "react";
import { QueryBuilder } from "@/components/trade/query-builder";
import { ItemCard } from "@/components/trade/item-card";
import { isBridgeReady, bridgeSearch, bridgeFetch } from "@/lib/trade-bridge";
import type { ListingRaw } from "@/lib/trade-api";

const DEFAULT_LEAGUE = "Runes of Aldur";

export default function TradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<ListingRaw[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Record<string, ListingRaw>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);

  useEffect(() => {
    if (isBridgeReady()) setBridgeActive(true);
    const handler = () => setBridgeActive(true);
    window.addEventListener("poe2:bridge-ready", handler);
    return () => window.removeEventListener("poe2:bridge-ready", handler);
  }, []);

  async function handleSearch(gggQuery: object) {
    if (!bridgeActive) return;
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
  }

  async function loadMore() {
    if (!queryId || loadingMore || !bridgeActive) return;
    setLoadingMore(true);
    const nextIds = allIds.slice(listings.length, listings.length + 10);
    try {
      const { result: items } = await bridgeFetch(nextIds, queryId) as { result: ListingRaw[] };
      setListings(prev => [...prev, ...items]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
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
      <aside
        className="w-72 shrink-0 rounded-lg p-4 border self-start sticky top-0 max-h-[calc(100vh-80px)] overflow-y-auto"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1.5 mb-4 text-xs"
          style={{ color: bridgeActive ? "var(--status-positive)" : "var(--status-warning)" }}>
          <span>{bridgeActive ? "●" : "○"}</span>
          {bridgeActive
            ? "Browser bridge active"
            : <span>Bridge not detected — <a href="/settings" style={{ color: "var(--accent)" }}>install in Settings</a></span>
          }
        </div>
        <QueryBuilder onSearch={handleSearch} loading={loading} />
      </aside>

      <div className="flex-1 min-w-0">
        {!bridgeActive && (
          <div className="rounded-lg p-4 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Browser bridge required</p>
            <p style={{ color: "var(--text-secondary)" }}>
              Trade searches run through a Tampermonkey script in your browser.{" "}
              <a href="/settings" style={{ color: "var(--accent)" }}>Go to Settings</a> to install it.
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
                <ItemCard
                  key={listing.id}
                  listing={listing}
                  bookmarked={!!bookmarks[listing.id]}
                  onBookmark={handleBookmark}
                  onUnbookmark={handleUnbookmark}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 rounded text-sm font-semibold cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
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
