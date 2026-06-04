"use client";

const BASE = "https://www.pathofexile.com/api/trade2";
const REALM = "poe2";

let bridgeReady = false;
let pendingResolvers = new Map<string, {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}>();

if (typeof window !== "undefined") {
  window.addEventListener("poe2:bridge-ready", () => { bridgeReady = true; });
  window.addEventListener("poe2:trade-response", (e: Event) => {
    const { id, status, data, error } = (e as CustomEvent).detail;
    const resolver = pendingResolvers.get(id);
    if (!resolver) return;
    pendingResolvers.delete(id);
    if (error) {
      resolver.reject(new Error(error));
    } else if (status >= 400) {
      resolver.reject(new Error(`GGG ${status}: ${data}`));
    } else {
      try {
        resolver.resolve(JSON.parse(data));
      } catch {
        resolver.reject(new Error("Invalid response from GGG"));
      }
    }
  });
}

function bridgeRequest(url: string, method: string, body?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingResolvers.set(id, { resolve, reject });

    // 10 second timeout
    setTimeout(() => {
      if (pendingResolvers.has(id)) {
        pendingResolvers.delete(id);
        reject(new Error("GGG request timed out"));
      }
    }, 10_000);

    window.dispatchEvent(new CustomEvent("poe2:trade-request", {
      detail: {
        id,
        url,
        method,
        body: body ? JSON.stringify(body) : null,
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Origin": "https://www.pathofexile.com",
          "Referer": "https://www.pathofexile.com/trade2",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    }));
  });
}

export function isBridgeReady(): boolean {
  return bridgeReady;
}

export async function bridgeSearch(query: object, league: string): Promise<unknown> {
  const url = `${BASE}/search/${REALM}/${encodeURIComponent(league)}`;
  return bridgeRequest(url, "POST", query);
}

export async function bridgeFetch(ids: string[], queryId: string): Promise<unknown> {
  const url = `${BASE}/fetch/${ids.slice(0, 10).join(",")}?query=${queryId}&realm=${REALM}`;
  return bridgeRequest(url, "GET");
}
