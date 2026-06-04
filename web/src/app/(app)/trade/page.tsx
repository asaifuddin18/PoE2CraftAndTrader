"use client";

import { useState, useCallback } from "react";
import { QueryBuilder, type TradeQuery, type StatFilter } from "@/components/trade/query-builder";
import { ItemCard } from "@/components/trade/item-card";
import type { ListingRaw } from "@/lib/trade-api";

function buildGGGQuery(q: TradeQuery) {
  const statFilters = q.stats
    .filter(s => s.id)
    .map(s => ({
      id: s.id,
      value: {
        ...(s.min !== "" ? { min: s.min } : {}),
        ...(s.max !== "" ? { max: s.max } : {}),
      },
      disabled: false,
    }));

  return {
    query: {
      status: { option: q.onlineOnly ? "online" : "any" },
      filters: {
        type_filters: {
          filters: {
            category: { option: q.category },
            ...(q.ilvlMin !== "" || q.ilvlMax !== "" ? {
              ilvl: {
                ...(q.ilvlMin !== "" ? { min: q.ilvlMin } : {}),
                ...(q.ilvlMax !== "" ? { max: q.ilvlMax } : {}),
              }
            } : {}),
          },
        },
      },
      stats: [
        {
          type: "and",
          filters: statFilters,
        },
      ],
    },
    sort: { price: "asc" },
  };
}

export default function TradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<ListingRaw[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Record<string, ListingRaw>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleSearch(q: TradeQuery) {
    setLoading(true);
    setError(null);
    setListings([]);
    setTotalResults(null);

    try {
      const gggQuery = buildGGGQuery(q);
      const searchRes = await fetch("/api/trade/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gggQuery),
      });
      if (!searchRes.ok) throw new Error(await searchRes.text());
      const { id, result } = await searchRes.json();

      setQueryId(id);
      setAllIds(result);
      setTotalResults(result.length);

      if (result.length === 0) return;

      // Fetch first 10
      const fetchRes = await fetch("/api/trade/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: result.slice(0, 10), queryId: id }),
      });
      if (!fetchRes.ok) throw new Error(await fetchRes.text());
      const { result: items } = await fetchRes.json();
      setListings(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!queryId || loadingMore) return;
    setLoadingMore(true);
    const nextIds = allIds.slice(listings.length, listings.length + 10);
    try {
      const fetchRes = await fetch("/api/trade/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: nextIds, queryId }),
      });
      const { result: items } = await fetchRes.json();
      setListings(prev => [...prev, ...items]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleBookmark(listing: ListingRaw) {
    setBookmarks(prev => ({ ...prev, [listing.id]: listing }));
    try {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, data: listing }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUnbookmark(id: string) {
    setBookmarks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await fetch("/api/bookmarks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  const hasMore = listings.length < (totalResults ?? 0) && listings.length < allIds.length;

  return (
    <div className="flex gap-5 h-full min-h-0" style={{ color: "var(--text-primary)" }}>
      {/* Left: Query builder */}
      <aside
        className="w-64 shrink-0 rounded-lg p-4 border self-start sticky top-0"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Trade Search
        </h2>
        <QueryBuilder onSearch={handleSearch} loading={loading} />
      </aside>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {/* Status bar */}
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
          <div
            className="rounded-lg p-3 mb-4 text-sm"
            style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border h-48 animate-pulse"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              />
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

        {!loading && listings.length === 0 && totalResults === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No results found.</p>
          </div>
        )}

        {!loading && listings.length === 0 && totalResults === null && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--text-disabled)" }}>
              Set your filters and hit Search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
