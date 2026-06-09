import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/dashboard");

  const { error } = await searchParams;
  const accessDenied = error === "AccessDenied";

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="card-elevated w-full max-w-sm p-8 flex flex-col items-center gap-6"
        style={{ borderRadius: 12 }}>
        <h1 className="display-sm" style={{ color: "var(--text-primary)" }}>
          PoE2 Craft &amp; Trade
        </h1>

        {accessDenied ? (
          <div className="w-full rounded-lg p-3 text-sm text-center"
            style={{ background: "#3a1a1a", border: "1px solid var(--status-negative)", color: "var(--status-negative)" }}>
            This site is currently private. Access is restricted.
          </div>
        ) : (
          <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
            Sign in to save queries, ideal items, and crafting sessions.
          </p>
        )}

        <SignInButton size="lg" />
      </div>
    </div>
  );
}
