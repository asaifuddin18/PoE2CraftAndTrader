"use client";

import { signIn } from "next-auth/react";

interface Props {
  size?: "sm" | "lg";
  /** "primary" = white fill (hero CTA); "secondary" = outlined (nav) */
  variant?: "primary" | "secondary";
}

export function SignInButton({ size = "sm", variant = "primary" }: Props) {
  const isLg = size === "lg";
  const isPrimary = variant === "primary";

  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className={`inline-flex items-center gap-2 font-medium transition-colors cursor-pointer rounded-full ${
        isLg ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
      }`}
      style={
        isPrimary
          ? { background: "#EDEDED", color: "#000" }
          : {
              background: "transparent",
              color: "var(--text-primary)",
              boxShadow: "inset 0 0 0 1px var(--border)",
            }
      }
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        if (isPrimary) el.style.background = "#fff";
        else el.style.boxShadow = "inset 0 0 0 1px var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        if (isPrimary) el.style.background = "#EDEDED";
        else el.style.boxShadow = "inset 0 0 0 1px var(--border)";
      }}
    >
      <GoogleIcon dark={isPrimary} />
      Sign in with Google
    </button>
  );
}

function GoogleIcon({ dark }: { dark: boolean }) {
  const fill = dark ? "#000" : "#EDEDED";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill={fill}
        fillOpacity="0.9"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill={fill}
        fillOpacity="0.9"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill={fill}
        fillOpacity="0.9"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill={fill}
        fillOpacity="0.9"
      />
    </svg>
  );
}
