"use client";

import { useEffect, useState, useCallback } from "react";
import { ItemCard } from "@/components/trade/item-card";
import { isBridgeReady, bridgeSearch, bridgeFetch } from "@/lib/trade-bridge";
import type { ListingRaw } from "@/lib/trade-api";

const DEFAULT_LEAGUE = "Runes of Aldur";

function buildAccountQuery(accountName: string, league: string) {
  return {
    query: {
      status: { option: "any" }, // include offline listings
      filters: {
        trade_filters: {
          filters: {
            account: { input: accountName },
          },
        },
      },
    },
    sort: { price: "asc" },
  };
}

export default function ListingsPage() {
  const [accountName, setAccountName] = useState<string | null>(null);
  const [league, setLeague]           = useState(DEFAULT_LEAGUE);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [listings, setListings]       = useState<ListingRaw[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [queryId, setQueryId]         = useState<string | null>(null);
  const [allIds, setAllIds]           = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bridgeActive, setBridgeActive] = useState(false);

  // Load settings
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setAccountName(d.poeAccountName ?? "");
        setLeague(d.poeLeague ?? DEFAULT_LEAGUE);
      });
  }, []);

  // Bridge detection
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
      const query = buildAccountQuery(name, lgue);
      const { id, result } = await bridgeSearch(query, lgue) as { id: string; result: string[] };
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

  // Auto-fetch once account name is loaded and bridge is ready
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

  const hasMore = listings.length < (allIds.length ?? 0) && listings.length > 0;

  // ── Render states ──────────────────────────────────────────────────────────

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
        <p className="text-xs mb-4" style={{ color: "var(--text-disabled)" }}>
          Add your Path of Exile account name in Settings to see your active listings.
        </p>
        <a href="/settings"
          className="text-sm px-4 py-2 rounded inline-block"
          style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}>
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div style={{ color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">My Listings</h1>
          {accountName && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-disabled)" }}>
              Account: <span style={{ color: "var(--text-secondary)" }}>{accountName}</span>
              {" · "}{league}
            </p>
          )}
        </div>
        {accountName && !loading && (
          <button
            onClick={() => fetchListings(accountName, league)}
            className="text-xs px-3 py-1.5 rounded cursor-pointer"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent" }}
          >
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
          {totalResults === 0
            ? "No active listings found."
            : `${totalResults} listing${totalResults !== 1 ? "s" : ""} — showing ${listings.length}`}
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
              <ItemCard
                key={listing.id}
                listing={listing}
                bookmarked={false}
                onBookmark={() => {}}
                onUnbookmark={() => {}}
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
    </div>
  );
}
