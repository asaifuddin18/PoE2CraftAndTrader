import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";

const FEATURES = [
  {
    title: "Crafting Optimizer",
    description:
      "Set your starting item, budget, and priorities. The optimizer learns an adaptive policy and shows the resulting item-quality distribution.",
  },
  {
    title: "Trade Search",
    description:
      "Build and save trade queries with mod filters and roll ranges. Results feed directly into the crafting cost comparison.",
  },
  {
    title: "Item Comparison",
    description:
      "Side-by-side mod diff between any listed item and your ideal target. Colour-coded: met, sub-tier, or missing.",
  },
  {
    title: "Simulators",
    description:
      "Divine Orb roll probability with distribution chart. Orb of Chance buy-vs-chance breakdown per unique base.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Nav */}
      <header
        className="flex items-center justify-between px-6 border-b"
        style={{ height: 64, borderColor: "var(--border)", background: "var(--bg-base)" }}
      >
        <span
          className="flex items-center gap-2.5 font-medium"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          <span
            className="inline-block rounded"
            style={{ width: 18, height: 18, background: "var(--text-primary)" }}
          />
          PoE2 Craft &amp; Trade
        </span>
        <SignInButton variant="secondary" />
      </header>

      {/* Hero */}
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <p
          className="font-mono text-xs mb-5"
          style={{ color: "var(--text-secondary)", letterSpacing: "0.04em" }}
        >
          PATH OF EXILE 2 · ENDGAME TOOLKIT
        </p>
        <h1 className="display-lg sm:text-5xl mb-5" style={{ color: "var(--text-primary)" }}>
          Craft smarter.<br />
          <span className="text-gradient">Trade better.</span>
        </h1>
        <p
          className="text-lg mb-10 max-w-xl"
          style={{ color: "var(--text-secondary)" }}
        >
          Find a near-ideal listing. See exactly what crafting steps get you the
          rest of the way — and whether buying beats crafting outright.
        </p>
        <SignInButton size="lg" />

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-20 max-w-3xl w-full text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-elevated card-elevated--hover p-6 transition-shadow">
              <h3
                className="font-medium mb-2"
                style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
              >
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>

        {/* Data sources note */}
        <p className="mt-16 text-xs" style={{ color: "var(--text-disabled)" }}>
          Prices sourced from{" "}
          <span style={{ color: "var(--text-secondary)" }}>poe2.ninja</span>
          {" · "}
          Mod weights from{" "}
          <span style={{ color: "var(--text-secondary)" }}>RePoE2</span>
        </p>
      </main>

      {/* Footer */}
      <footer
        className="px-8 py-4 border-t flex items-center justify-between text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-disabled)" }}
      >
        <span>Not affiliated with or endorsed by Grinding Gear Games.</span>
        <a
          href="https://github.com/asaifuddin18/PoE2CraftAndTrader"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--text-secondary)" }}
          className="hover:underline"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
