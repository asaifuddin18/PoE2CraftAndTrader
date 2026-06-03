"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/trade": "Trade Search",
  "/craft": "Craft Solver",
  "/simulate": "Simulators",
  "/listings": "My Listings",
  "/queries": "Saved Queries",
  "/ideal-items": "Ideal Items",
  "/sessions": "Session Log",
  "/settings": "Settings",
};

interface Props {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function TopBar({ user }: Props) {
  const pathname = usePathname();
  const segment = "/" + pathname.split("/")[1];
  const title = TITLES[segment] ?? "PoE2 Craft & Trade";

  return (
    <header
      className="fixed top-0 left-[220px] right-0 h-14 flex items-center justify-between px-6 border-b z-10"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <h1 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h1>

      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {user.name ?? user.email}
        </span>
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name ?? "avatar"}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
          >
            {(user.name ?? user.email ?? "?")[0].toUpperCase()}
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer"
          style={{
            color: "var(--text-secondary)",
            borderColor: "var(--border)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.borderColor = "var(--text-disabled)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
