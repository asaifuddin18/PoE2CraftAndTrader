"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Tools",
    items: [
      { label: "Trade Search", href: "/trade", icon: SearchIcon },
      { label: "Economy", href: "/economy", icon: CoinIcon },
      { label: "Craft Solver", href: "/craft", icon: HammerIcon },
      { label: "Simulators", href: "/simulate", icon: DiceIcon },
    ],
  },
  {
    section: "My Account",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: GridIcon },
      { label: "Saved Queries", href: "/queries", icon: BookmarkIcon },
      { label: "Ideal Items", href: "/ideal-items", icon: TargetIcon },
      { label: "Session Log", href: "/sessions", icon: ClockIcon },
      { label: "My Listings", href: "/listings", icon: TagIcon },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Settings", href: "/settings", icon: GearIcon },
    ],
  },
];

const ACTIVE_BG = "rgba(121, 40, 202, 0.15)";
const ACTIVE_RING = "inset 0 0 0 1px rgba(121, 40, 202, 0.30)";
const HOVER_BG = "rgba(255, 255, 255, 0.05)";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[220px] flex flex-col border-r z-20"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 h-14 px-5 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="inline-flex items-center justify-center rounded-md shrink-0"
          style={{
            width: 22,
            height: 22,
            background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "#000" }} />
        </span>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          PoE2 Craft &amp; Trade
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV.map((group) => (
          <div key={group.section} className="mb-6">
            <p
              className="px-2 mb-1.5 font-mono uppercase"
              style={{
                color: "var(--text-disabled)",
                fontSize: 10.5,
                letterSpacing: "0.12em",
              }}
            >
              {group.section}
            </p>
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors"
                  style={{
                    fontSize: 13,
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    background: active ? ACTIVE_BG : "transparent",
                    boxShadow: active ? ACTIVE_RING : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = HOVER_BG;
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <Icon active={active} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="shrink-0 border-t px-3 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <a
          href="https://github.com/asaifuddin18/PoE2CraftAndTrader"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors"
          style={{ fontSize: 13, color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <GithubIcon />
          GitHub
          <ExternalIcon />
        </a>
      </div>
    </aside>
  );
}

// --- Icons (16×16 SVG) ---

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <path d="M10.5 10.5L13.5 13.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HammerIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 14L7 9" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="7" y="3" width="7" height="4" rx="1" transform="rotate(45 7 3)" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
    </svg>
  );
}

function CoinIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <path d="M8 5v1.5M8 9.5V11M6.5 6.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S8.83 8 8 8s-1.5.67-1.5 1.5S7.17 11 8 11" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DiceIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="1" fill={active ? "var(--accent-hover)" : "currentColor"} />
      <circle cx="10.5" cy="5.5" r="1" fill={active ? "var(--accent-hover)" : "currentColor"} />
      <circle cx="5.5" cy="10.5" r="1" fill={active ? "var(--accent-hover)" : "currentColor"} />
      <circle cx="10.5" cy="10.5" r="1" fill={active ? "var(--accent-hover)" : "currentColor"} />
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
    </svg>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2h8a1 1 0 0 1 1 1v10l-5-3-5 3V3a1 1 0 0 1 1-1z" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TargetIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="0.75" fill={active ? "var(--accent-hover)" : "currentColor"} />
    </svg>
  );
}

function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <path d="M8 5v3.5l2.5 1.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="5" cy="5" r="1" fill={active ? "var(--accent-hover)" : "currentColor"} />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" stroke={active ? "var(--accent-hover)" : "currentColor"} strokeWidth="1.5" />
      <path
        d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"
        stroke={active ? "var(--accent-hover)" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg className="ml-auto" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden style={{ opacity: 0.6 }}>
      <path d="M8.5 3.5h4v4M12.5 3.5L7 9M11.5 9v3.5h-8v-8H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
