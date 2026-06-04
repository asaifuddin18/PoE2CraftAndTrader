"use client";

import Image from "next/image";
import { useState } from "react";
import { parseMod, type ListingRaw } from "@/lib/trade-api";

const RARITY_COLOR: Record<string, string> = {
  Normal:  "#c8c8c8",
  Magic:   "#8888ff",
  Rare:    "#ffff77",
  Unique:  "#af6025",
};

const CURRENCY_ABBREV: Record<string, string> = {
  regal:           "regal",
  chaos:           "chaos",
  exalted:         "exalt",
  divine:          "divine",
  "orb-of-alchemy":"alch",
  vaal:            "vaal",
};

interface Props {
  listing: ListingRaw;
  bookmarked: boolean;
  onBookmark: (listing: ListingRaw) => void;
  onUnbookmark: (id: string) => void;
}

export function ItemCard({ listing, bookmarked, onBookmark, onUnbookmark }: Props) {
  const { item, listing: info } = listing;
  const [copied, setCopied] = useState(false);
  const [copiedHideout, setCopiedHideout] = useState(false);

  const rarityColor = RARITY_COLOR[item.rarity] ?? "#c8c8c8";
  const price = info.price;
  const currency = CURRENCY_ABBREV[price.currency] ?? price.currency;

  const allMods = [
    ...(item.implicitMods ?? []).map(m => ({ text: m, type: "implicit" })),
    ...(item.explicitMods ?? []).map(m => ({ text: m, type: "explicit" })),
    ...(item.fracturedMods ?? []).map(m => ({ text: m, type: "fractured" })),
    ...(item.enchantMods ?? []).map(m => ({ text: m, type: "enchant" })),
  ];

  function copyWhisper() {
    navigator.clipboard.writeText(info.whisper);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyHideout() {
    // Sends the seller a whisper to visit their hideout
    const charName = info.account.lastCharacterName;
    navigator.clipboard.writeText(`@${charName} /hideout`);
    setCopiedHideout(true);
    setTimeout(() => setCopiedHideout(false), 2000);
  }

  function toggleBookmark() {
    if (bookmarked) {
      onUnbookmark(listing.id);
    } else {
      onBookmark(listing);
    }
  }

  return (
    <div
      className="rounded-lg border flex flex-col"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b rounded-t-lg"
        style={{ borderColor: "var(--border)", borderBottom: `2px solid ${rarityColor}33` }}
      >
        {/* Item icon */}
        <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
          <Image
            src={item.icon}
            alt={item.typeLine}
            width={40}
            height={40}
            className="object-contain"
            unoptimized
          />
        </div>

        <div className="flex-1 min-w-0">
          {item.name && (
            <p className="text-xs font-semibold truncate" style={{ color: rarityColor }}>
              {item.name}
            </p>
          )}
          <p className="text-xs truncate" style={{ color: item.name ? "var(--text-secondary)" : rarityColor }}>
            {item.typeLine}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-semibold" style={{ color: "var(--status-positive)" }}>
            {price.amount} {currency}
          </p>
          <p className="text-xs" style={{ color: "var(--text-disabled)" }}>
            ilvl {item.ilvl}
          </p>
        </div>
      </div>

      {/* Mods */}
      <div className="px-3 py-2 flex-1 space-y-0.5">
        {allMods.map((mod, i) => (
          <p
            key={i}
            className="text-xs leading-relaxed"
            style={{
              color:
                mod.type === "implicit"  ? "var(--text-secondary)" :
                mod.type === "fractured" ? "#a29162" :
                mod.type === "enchant"   ? "#b4b4ff" :
                "var(--status-info)",
            }}
          >
            {parseMod(mod.text)}
          </p>
        ))}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 py-2 border-t gap-2"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-xs truncate" style={{ color: "var(--text-disabled)" }}>
          {info.account.lastCharacterName}
        </p>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={copyHideout}
            className="text-xs px-2 py-1 rounded border cursor-pointer transition-colors"
            style={{
              color: copiedHideout ? "var(--status-positive)" : "var(--text-secondary)",
              borderColor: "var(--border)",
              background: "transparent",
            }}
            title="Copy hideout whisper — paste in game to visit seller's hideout"
          >
            {copiedHideout ? "✓" : "🏠"}
          </button>
          <button
            onClick={copyWhisper}
            className="text-xs px-2 py-1 rounded border cursor-pointer transition-colors"
            style={{
              color: copied ? "var(--status-positive)" : "var(--text-secondary)",
              borderColor: "var(--border)",
              background: "transparent",
            }}
            title="Copy trade whisper"
          >
            {copied ? "✓" : "💬"}
          </button>
          <button
            onClick={toggleBookmark}
            className="text-xs px-2 py-1 rounded border cursor-pointer transition-colors"
            style={{
              color: bookmarked ? "var(--status-warning)" : "var(--text-secondary)",
              borderColor: bookmarked ? "var(--status-warning)" : "var(--border)",
              background: "transparent",
            }}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
      </div>
    </div>
  );
}
