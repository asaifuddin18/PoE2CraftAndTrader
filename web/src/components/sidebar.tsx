"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Tools",
    items: [
      { label: "Trade Search", href: "/trade", icon: SearchIcon },
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[220px] flex flex-col border-r z-20"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center h-14 px-5 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          PoE2 Craft &amp; Trade
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV.map((group) => (
          <div key={group.section} className="mb-5">
            <p
              className="px-2 mb-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-disabled)" }}
            >
              {group.section}
            </p>
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    background: active ? "var(--bg-elevated)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "var(--bg-elevated)";
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
    </aside>
  );
}

// --- Icons (16×16 SVG) ---

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <path d="M10.5 10.5L13.5 13.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HammerIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 14L7 9" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="7" y="3" width="7" height="4" rx="1" transform="rotate(45 7 3)" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
    </svg>
  );
}

function DiceIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="1" fill={active ? "var(--accent)" : "currentColor"} />
      <circle cx="10.5" cy="5.5" r="1" fill={active ? "var(--accent)" : "currentColor"} />
      <circle cx="5.5" cy="10.5" r="1" fill={active ? "var(--accent)" : "currentColor"} />
      <circle cx="10.5" cy="10.5" r="1" fill={active ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
    </svg>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2h8a1 1 0 0 1 1 1v10l-5-3-5 3V3a1 1 0 0 1 1-1z" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TargetIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <circle cx="8" cy="8" r="0.75" fill={active ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}

function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <path d="M8 5v3.5l2.5 1.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="5" cy="5" r="1" fill={active ? "var(--accent)" : "currentColor"} />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.5" />
      <path
        d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"
        stroke={active ? "var(--accent)" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
