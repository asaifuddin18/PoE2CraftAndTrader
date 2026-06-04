"use client";

import Image from "next/image";
import { useState } from "react";
import { parseMod, type ListingRaw, type ModDetail } from "@/lib/trade-api";

const RARITY_COLOR: Record<string, string> = {
  Normal:  "#c8c8c8",
  Magic:   "#8888ff",
  Rare:    "#ffff77",
  Unique:  "#af6025",
};

const CURRENCY_ABBREV: Record<string, string> = {
  regal: "regal", chaos: "chaos", exalted: "exalt",
  divine: "divine", "orb-of-alchemy": "alch", vaal: "vaal",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Parse a property value like "10-20" or "150" into a number range
function parsePropValue(val: string): { min: number; max: number } | null {
  const m = val.match(/^([\d.]+)(?:-([\d.]+))?$/);
  if (!m) return null;
  const min = parseFloat(m[1]);
  const max = m[2] ? parseFloat(m[2]) : min;
  return { min, max };
}

interface WeaponStats {
  phys: number; elem: number; total: number;
  aps: number; crit: string; reloadTime?: string;
}

function calcWeaponStats(properties: ListingRaw["item"]["properties"], typeLine?: string): WeaponStats | null {
  if (!properties?.length) return null;

  // Property names have the same [key|display] markup as mods — strip it before comparing
  const get = (name: string) =>
    properties.find(p => parseMod(p.name) === name)?.values?.[0]?.[0] as string | undefined;

  // Debug: log all property names and values for weapons
  if (process.env.NODE_ENV === "development" || typeof window !== "undefined") {
    const hasAps = properties.some(p => p.name === "Attacks per Second");
    if (hasAps) {
      console.log("[ItemCard] weapon properties for", typeLine, ":",
        properties.map(p => `${p.name}=${JSON.stringify(p.values)}`).join(", "));
    }
  }

  const apsStr = get("Attacks per Second");
  if (!apsStr) return null;

  const aps = parsePropValue(apsStr);
  if (!aps) return null;
  const apsVal = (aps.min + aps.max) / 2;

  // Physical damage — may be 0 on fully-converted weapons
  const physStr  = get("Physical Damage");
  const physRange = physStr ? parsePropValue(physStr) : null;
  const physDps  = physRange ? ((physRange.min + physRange.max) / 2) * apsVal : 0;

  const ELEM_NAMES = ["Fire Damage", "Cold Damage", "Lightning Damage", "Chaos Damage"];
  let elemDps = 0;
  for (const name of ELEM_NAMES) {
    const str = get(name);
    if (!str) continue;
    const range = parsePropValue(str);
    if (range) elemDps += ((range.min + range.max) / 2) * apsVal;
  }

  if (physDps === 0 && elemDps === 0) return null;

  const critStr       = get("Critical Hit Chance") ?? get("Critical Strike Chance") ?? "";
  const reloadTimeStr = get("Reload Time");

  return {
    phys:       Math.round(physDps * 10) / 10,
    elem:       Math.round(elemDps * 10) / 10,
    total:      Math.round((physDps + elemDps) * 10) / 10,
    aps:        Math.round(apsVal * 100) / 100,
    crit:       critStr,
    reloadTime: reloadTimeStr,
  };
}

// Parse tier string: "S4" → { type: "Suffix", tier: 4 }, "P2" → { type: "Prefix", tier: 2 }
function parseTier(tierStr: string): { type: "Prefix" | "Suffix"; tier: number } | null {
  const m = tierStr.match(/^([SP])(\d+)$/);
  if (!m) return null;
  return { type: m[1] === "P" ? "Prefix" : "Suffix", tier: parseInt(m[2]) };
}

function fmt(n: number | string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

interface Props {
  listing: ListingRaw;
  bookmarked: boolean;
  onBookmark: (listing: ListingRaw) => void;
  onUnbookmark: (id: string) => void;
  showActions?: boolean; // default true — set false on My Listings page
}

export function ItemCard({ listing, bookmarked, onBookmark, onUnbookmark, showActions = true }: Props) {
  const { item, listing: info } = listing;
  const [copied, setCopied] = useState(false);
  const [copiedHideout, setCopiedHideout] = useState(false);

  const rarityColor = RARITY_COLOR[item.rarity] ?? "#c8c8c8";
  const price = info.price;
  const currency = CURRENCY_ABBREV[price.currency] ?? price.currency;
  const weaponStats = calcWeaponStats(item.properties, item.typeLine);

  // Build a map from mod text → extended detail for tier/range lookup
  const extMods: ModDetail[] = [
    ...(item.extended?.mods?.explicit ?? []),
    ...(item.extended?.mods?.implicit ?? []),
  ];

  const implicitMods  = item.implicitMods  ?? [];
  const explicitMods  = item.explicitMods  ?? [];
  const fracturedMods = item.fracturedMods ?? [];
  const enchantMods   = item.enchantMods   ?? [];

  function copyWhisper() {
    navigator.clipboard.writeText(info.whisper);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function copyHideout() {
    navigator.clipboard.writeText(`@${info.account.lastCharacterName} /hideout`);
    setCopiedHideout(true);
    setTimeout(() => setCopiedHideout(false), 2000);
  }
  function toggleBookmark() {
    bookmarked ? onUnbookmark(listing.id) : onBookmark(listing);
  }

  function ModLine({ text, modType, extIndex }: { text: string; modType: string; extIndex?: number }) {
    const ext = extIndex !== undefined ? extMods[extIndex] : undefined;
    const tierInfo = ext ? parseTier(ext.tier) : null;

    const modColor =
      modType === "implicit"  ? "var(--text-secondary)" :
      modType === "fractured" ? "#a29162" :
      modType === "enchant"   ? "#b4b4ff" :
      "var(--status-info)";

    const tagColor = "var(--text-disabled)";

    return (
      <div className="flex items-start justify-between gap-2 py-0.5">
        <p className="text-xs leading-relaxed flex-1" style={{ color: modColor }}>
          {parseMod(text)}
          {/* Roll range for this tier */}
          {ext?.magnitudes?.[0] && (
            <span className="ml-1" style={{ color: "var(--text-disabled)", fontSize: 10 }}>
              ({fmt(ext.magnitudes[0].min)}–{fmt(ext.magnitudes[0].max)})
            </span>
          )}
        </p>
        {tierInfo && (
          <span
            className="text-xs shrink-0 px-1 py-0.5 rounded"
            style={{
              color: tagColor,
              background: "var(--bg-elevated)",
              fontSize: 10,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
            title={`${tierInfo.type} Tier ${tierInfo.tier}`}
          >
            {tierInfo.type === "Prefix" ? "P" : "S"}·T{tierInfo.tier}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border flex flex-col" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b rounded-t-lg"
        style={{ borderColor: "var(--border)", borderBottom: `2px solid ${rarityColor}33` }}
      >
        <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
          <Image src={item.icon} alt={item.typeLine} width={40} height={40} className="object-contain" unoptimized />
        </div>
        <div className="flex-1 min-w-0">
          {item.name && (
            <p className="text-xs font-semibold truncate" style={{ color: rarityColor }}>{item.name}</p>
          )}
          <p className="text-xs truncate" style={{ color: item.name ? "var(--text-secondary)" : rarityColor }}>
            {item.typeLine}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold" style={{ color: "var(--status-positive)" }}>{price.amount} {currency}</p>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>ilvl {item.ilvl}</p>
        </div>
      </div>

      {/* Weapon stats */}
      {weaponStats && (
        <div
          className="px-3 py-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs border-b"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <span><span style={{ color: "var(--text-disabled)" }}>Total DPS </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{weaponStats.total}</span></span>
          <span><span style={{ color: "var(--text-disabled)" }}>APS </span>{weaponStats.aps}</span>
          {weaponStats.phys > 0 && <span><span style={{ color: "var(--text-disabled)" }}>Phys DPS </span>{weaponStats.phys}</span>}
          {weaponStats.crit && <span><span style={{ color: "var(--text-disabled)" }}>Crit </span>{weaponStats.crit}</span>}
          {weaponStats.elem > 0 && <span><span style={{ color: "var(--text-disabled)" }}>Elem DPS </span>{weaponStats.elem}</span>}
          {weaponStats.reloadTime && <span><span style={{ color: "var(--text-disabled)" }}>Reload </span>{weaponStats.reloadTime}s</span>}
        </div>
      )}

      {/* Mods */}
      <div className="px-3 py-2 flex-1">
        {implicitMods.map((t, i) => <ModLine key={`imp-${i}`} text={t} modType="implicit" />)}
        {implicitMods.length > 0 && explicitMods.length > 0 && (
          <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
        )}
        {enchantMods.map((t, i) => <ModLine key={`enc-${i}`} text={t} modType="enchant" />)}
        {explicitMods.map((t, i) => <ModLine key={`exp-${i}`} text={t} modType="explicit" extIndex={i} />)}
        {fracturedMods.map((t, i) => <ModLine key={`frac-${i}`} text={t} modType="fractured" extIndex={explicitMods.length + i} />)}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t" style={{ borderColor: "var(--border)" }}>
        {/* Seller row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Online indicator */}
            <span
              title={info.account.online ? "Online" : "Offline"}
              style={{ color: info.account.online ? "var(--status-positive)" : "var(--text-disabled)", fontSize: 8, flexShrink: 0 }}
            >●</span>
            <p className="text-xs truncate" style={{ color: "var(--text-disabled)" }}>
              {info.account.lastCharacterName}
            </p>
          </div>
          <p className="text-xs shrink-0" style={{ color: "var(--text-disabled)" }}>
            {timeAgo(info.indexed)}
          </p>
        </div>

        {/* Action buttons */}
        {showActions && <div className="flex gap-1.5">
          {info.account.online ? (
            /* Seller is online → In Person trade, visit their hideout */
            <button
              onClick={copyHideout}
              className="flex-1 text-xs py-1.5 rounded border cursor-pointer font-semibold transition-colors"
              style={{
                background: copiedHideout ? "var(--status-positive)" : "var(--accent)",
                borderColor: copiedHideout ? "var(--status-positive)" : "var(--accent)",
                color: "#fff",
              }}
              title="Copy /hideout whisper — paste in game, seller will invite you"
            >
              {copiedHideout ? "✓ Copied" : "🏠 Visit Hideout"}
            </button>
          ) : (
            /* Seller offline / Instant Buyout — whisper triggers automatic trade */
            <button
              onClick={copyWhisper}
              className="flex-1 text-xs py-1.5 rounded border cursor-pointer font-semibold"
              style={{
                background: copied ? "var(--status-positive)" : "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: copied ? "#fff" : "var(--text-secondary)",
              }}
              title={
                info.price.type === "~price"
                  ? "Instant Buyout — whisper triggers automatic trade"
                  : "Copy whisper — paste in game to buy"
              }
            >
              {copied
                ? "✓ Copied"
                : info.price.type === "~price"
                  ? "⚡ Instant Buy"
                  : "💬 Whisper"}
            </button>
          )}
          <button
            onClick={toggleBookmark}
            className="text-xs px-2.5 py-1.5 rounded border cursor-pointer"
            style={{
              color: bookmarked ? "var(--status-warning)" : "var(--text-secondary)",
              borderColor: bookmarked ? "var(--status-warning)" : "var(--border)",
              background: "transparent",
            }}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>}
      </div>
    </div>
  );
}
