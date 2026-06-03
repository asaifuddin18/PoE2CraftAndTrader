import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      <header
        className="flex items-center justify-between px-8 h-14 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        <span className="text-base font-semibold">PoE2 Craft &amp; Trade</span>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {session.user?.name}
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Dashboard coming soon.
        </p>
      </main>
    </div>
  );
}
