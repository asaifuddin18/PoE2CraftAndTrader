import assert from "node:assert/strict";
import { CraftedItem } from "./domain/CraftedItem";
import { EssenceCatalog } from "./domain/EssenceCatalog";
import type { CraftContext } from "./domain/CraftContext";
import {
  AlchemyOrb,
  AnnulmentOrb,
  AugmentationOrb,
  ChaosOrb,
  Essence,
  ExaltedOrb,
  FracturingOrb,
  GreaterAugmentationOrb,
  GreaterChaosOrb,
  GreaterExaltedOrb,
  GreaterRegalOrb,
  GreaterTransmutationOrb,
  PerfectAugmentationOrb,
  PerfectChaosOrb,
  PerfectExaltedOrb,
  PerfectRegalOrb,
  PerfectTransmutationOrb,
  RegalOrb,
  TransmutationOrb,
} from "./ingredients";
import {
  OmenOfDextralAnnulment,
  OmenOfDextralCrystallisation,
  OmenOfDextralErasure,
  OmenOfDextralExaltation,
  OmenOfGreaterExaltation,
  OmenOfSinistralAnnulment,
  OmenOfSinistralCrystallisation,
  OmenOfSinistralErasure,
  OmenOfSinistralExaltation,
  OmenOfWhittling,
  withModifiers,
} from "./modifiers";
import { build_pools } from "./engine";
import type { ItemState, ModEntry, ModPool, RawMod } from "./types";

type TestFn = () => void;

const tests: { name: string; fn: TestFn }[] = [];
function test(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function mod(modId: string, gen_type: "prefix" | "suffix", required_level = 1, weight = 100): ModEntry {
  return { modId, group: modId, gen_type, tier: 1, required_level, weight, name: modId };
}

const p1 = mod("p1", "prefix", 1);
const p2 = mod("p2", "prefix", 20);
const p3 = mod("p3", "prefix", 30);
const p4 = mod("p4", "prefix", 40);
const s1 = mod("s1", "suffix", 10);
const s2 = mod("s2", "suffix", 20);
const s3 = mod("s3", "suffix", 30);
const s4 = mod("s4", "suffix", 40);

const pool: ModPool = {
  prefixes: [p1, p2, p3, p4],
  suffixes: [s1, s2, s3, s4],
};

function rngSequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

function seededRng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function ctx(rng: () => number = rngSequence([0])): CraftContext {
  return { pool, rng };
}

function ctxWithPool(customPool: ModPool, rng: () => number = rngSequence([0])): CraftContext {
  return { pool: customPool, rng };
}

function item(prefixes: ModEntry[], suffixes: ModEntry[], fractured: ModEntry[] = []): CraftedItem {
  const state: ItemState = {
    rarity: "rare",
    prefixes,
    suffixes,
    fractured_mod_ids: new Set(fractured.map(m => m.modId)),
    corrupted: false,
  };
  return CraftedItem.fromState(state);
}

function magic(prefixes: ModEntry[], suffixes: ModEntry[] = []): CraftedItem {
  const state: ItemState = {
    rarity: "magic",
    prefixes,
    suffixes,
    fractured_mod_ids: new Set(),
    corrupted: false,
  };
  return CraftedItem.fromState(state);
}

function modIds(i: CraftedItem): string[] {
  const s = i.toState();
  return [...s.prefixes, ...s.suffixes].map(m => m.modId).sort();
}

function countMods(i: CraftedItem): number {
  const s = i.toState();
  return s.prefixes.length + s.suffixes.length;
}

function testEssence(id: string, guaranteedMod: ModEntry, tier: "greater" | "perfect"): Essence {
  return new Essence(id, id, tier, [guaranteedMod]);
}

function removedEventId(result: { events: { details?: Record<string, unknown> }[] }): string | null {
  return (result.events[0]?.details?.removed as string | null | undefined) ?? null;
}

function assertRejected(
  result: { applied: boolean; item: CraftedItem; cost: Record<string, number>; events: { type: string }[] },
  original: CraftedItem,
) {
  assert.equal(result.applied, false);
  assert.deepEqual(result.cost, {});
  assert.deepEqual(result.item.toState(), original.toState());
  assert.equal(result.events[0]?.type, "rejected");
}

test("Transmutation Orb makes a magic item and adds one random affix", () => {
  const result = new TransmutationOrb().apply(CraftedItem.emptyNormal(), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.rarity, "magic");
  assert.equal(countMods(result.item), 1);
  assert.deepEqual(result.cost, { transmute: 1 });
});

test("Augmentation Orb adds the missing magic affix", () => {
  const result = new AugmentationOrb().apply(magic([p1]), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.prefixes.length, 1);
  assert.equal(state.suffixes.length, 1);
  assert.deepEqual(result.cost, { augment: 1 });
});

test("Regal Orb upgrades magic to rare and adds one affix", () => {
  const result = new RegalOrb().apply(magic([p1]), ctx(rngSequence([0.9, 0])));
  const state = result.item.toState();
  assert.equal(state.rarity, "rare");
  assert.equal(countMods(result.item), 2);
  assert.deepEqual(result.cost, { regal: 1 });
});

test("Alchemy Orb makes a rare item with up to four random affixes", () => {
  const result = new AlchemyOrb().apply(CraftedItem.emptyNormal(), ctx(seededRng(4)));
  const state = result.item.toState();
  assert.equal(state.rarity, "rare");
  assert.equal(countMods(result.item), 4);
  assert.deepEqual(result.cost, { alch: 1 });
});

test("Exalted Orb adds one affix; Greater omen makes it add two and charges the omen", () => {
  const plain = new ExaltedOrb().apply(item([], []), ctx(rngSequence([0, 0])));
  assert.equal(countMods(plain.item), 1);
  assert.deepEqual(plain.cost, { exalt: 1 });

  const greater = withModifiers(new ExaltedOrb(), new OmenOfGreaterExaltation())
    .apply(item([], []), ctx(rngSequence([0, 0, 0.9, 0])));
  assert.equal(countMods(greater.item), 2);
  assert.deepEqual(greater.cost, { exalt: 1, omen_greater: 1 });
});

test("Greater and Perfect Exalted Orbs enforce required-level floors", () => {
  const lowPrefix = mod("low_prefix", "prefix", 20, 10_000);
  const greaterPrefix = mod("greater_prefix", "prefix", 35, 1);
  const perfectPrefix = mod("perfect_prefix", "prefix", 50, 1);
  const highPool: ModPool = { prefixes: [lowPrefix, greaterPrefix, perfectPrefix], suffixes: [] };

  const normal = new ExaltedOrb().apply(item([], []), ctxWithPool(highPool, rngSequence([0])));
  assert.equal(normal.item.toState().prefixes[0]?.required_level, 20);

  const greater = new GreaterExaltedOrb().apply(item([], []), ctxWithPool(highPool, rngSequence([0])));
  assert.ok((greater.item.toState().prefixes[0]?.required_level ?? 0) >= 35);
  assert.deepEqual(greater.cost, { greater_exalt: 1 });

  const perfect = new PerfectExaltedOrb().apply(item([], []), ctxWithPool(highPool, rngSequence([0])));
  assert.ok((perfect.item.toState().prefixes[0]?.required_level ?? 0) >= 50);
  assert.deepEqual(perfect.cost, { perfect_exalt: 1 });
});

test("Greater and Perfect Transmutation Orbs enforce required-level floors", () => {
  const thresholdPool: ModPool = {
    prefixes: [mod("p_low", "prefix", 20), mod("p_greater", "prefix", 44), mod("p_perfect", "prefix", 70)],
    suffixes: [mod("s_low", "suffix", 20), mod("s_greater", "suffix", 44), mod("s_perfect", "suffix", 70)],
  };

  const greater = new GreaterTransmutationOrb().apply(
    CraftedItem.emptyNormal(),
    ctxWithPool(thresholdPool, rngSequence([0, 0])),
  );
  assert.ok(greater.item.allMods()[0].required_level >= 44);
  assert.deepEqual(greater.cost, { greater_transmute: 1 });

  const perfect = new PerfectTransmutationOrb().apply(
    CraftedItem.emptyNormal(),
    ctxWithPool(thresholdPool, rngSequence([0, 0])),
  );
  assert.ok(perfect.item.allMods()[0].required_level >= 70);
  assert.deepEqual(perfect.cost, { perfect_transmute: 1 });
});

test("Greater and Perfect Augmentation Orbs enforce required-level floors", () => {
  const thresholdPool: ModPool = {
    prefixes: [],
    suffixes: [mod("s_low", "suffix", 20), mod("s_greater", "suffix", 44), mod("s_perfect", "suffix", 70)],
  };

  const greater = new GreaterAugmentationOrb().apply(
    magic([p1]),
    ctxWithPool(thresholdPool, rngSequence([0])),
  );
  assert.ok(greater.item.toState().suffixes[0].required_level >= 44);
  assert.deepEqual(greater.cost, { greater_augment: 1 });

  const perfect = new PerfectAugmentationOrb().apply(
    magic([p1]),
    ctxWithPool(thresholdPool, rngSequence([0])),
  );
  assert.ok(perfect.item.toState().suffixes[0].required_level >= 70);
  assert.deepEqual(perfect.cost, { perfect_augment: 1 });
});

test("Greater and Perfect Regal Orbs enforce required-level floors", () => {
  const thresholdPool: ModPool = {
    prefixes: [],
    suffixes: [mod("s_low", "suffix", 20), mod("s_greater", "suffix", 35), mod("s_perfect", "suffix", 50)],
  };

  const greater = new GreaterRegalOrb().apply(magic([p1]), ctxWithPool(thresholdPool, rngSequence([0.9, 0])));
  assert.ok(greater.item.toState().suffixes[0].required_level >= 35);
  assert.deepEqual(greater.cost, { greater_regal: 1 });

  const perfect = new PerfectRegalOrb().apply(magic([p1]), ctxWithPool(thresholdPool, rngSequence([0.9, 0])));
  assert.ok(perfect.item.toState().suffixes[0].required_level >= 50);
  assert.deepEqual(perfect.cost, { perfect_regal: 1 });
});

test("Perfect Exalted Orb still respects the item's ilvl ceiling", () => {
  const raw: RawMod = {
    modId: "tiered",
    name: "Tiered Prefix",
    affix: "prefix",
    modgroups: ["Tiered"],
    tags: [],
    tiers: [
      { tier: 1, ilvl: 60, weight: 100, values: [] },
      { tier: 2, ilvl: 50, weight: 100, values: [] },
      { tier: 3, ilvl: 35, weight: 100, values: [] },
    ],
  };
  const ilvl55Pool = build_pools([raw], 55);
  const result = new PerfectExaltedOrb().apply(item([], []), ctxWithPool(ilvl55Pool, rngSequence([0])));
  const added = result.item.toState().prefixes[0];
  assert.equal(added?.required_level, 50);
  assert.notEqual(added?.required_level, 60);
});

test("Greater Exaltation omen works with all exalted-orb variants", () => {
  const variants = [
    new ExaltedOrb(),
    new GreaterExaltedOrb(),
    new PerfectExaltedOrb(),
  ];
  const highPool: ModPool = {
    prefixes: [mod("p35", "prefix", 35), mod("p50", "prefix", 50)],
    suffixes: [mod("s35", "suffix", 35), mod("s50", "suffix", 50)],
  };

  for (const ingredient of variants) {
    const result = withModifiers(ingredient, new OmenOfGreaterExaltation())
      .apply(item([], []), ctxWithPool(highPool, rngSequence([0, 0, 0.9, 0])));
    assert.equal(countMods(result.item), 2, ingredient.displayName);
    assert.equal(result.cost[ingredient.id], 1);
    assert.equal(result.cost.omen_greater, 1);
  }
});

test("Sinistral and Dextral exaltation omens target prefix/suffix add slots", () => {
  const sin = withModifiers(new ExaltedOrb(), new OmenOfSinistralExaltation())
    .apply(item([], []), ctx(rngSequence([0])));
  assert.equal(sin.item.toState().prefixes.length, 1);
  assert.equal(sin.item.toState().suffixes.length, 0);
  assert.deepEqual(sin.cost, { exalt: 1, omen_sinistral: 1 });

  const dex = withModifiers(new ExaltedOrb(), new OmenOfDextralExaltation())
    .apply(item([], []), ctx(rngSequence([0])));
  assert.equal(dex.item.toState().prefixes.length, 0);
  assert.equal(dex.item.toState().suffixes.length, 1);
  assert.deepEqual(dex.cost, { exalt: 1, omen_dextral: 1 });
});

test("Sinistral and Dextral exaltation omens work with tiered Regal Orbs", () => {
  const thresholdPool: ModPool = {
    prefixes: [mod("p50", "prefix", 50)],
    suffixes: [mod("s50", "suffix", 50)],
  };

  const sin = withModifiers(new PerfectRegalOrb(), new OmenOfSinistralExaltation())
    .apply(magic([], [s1]), ctxWithPool(thresholdPool, rngSequence([0])));
  assert.equal(sin.item.toState().prefixes[0]?.modId, "p50");
  assert.deepEqual(sin.cost, { perfect_regal: 1, omen_sinistral: 1 });

  const dex = withModifiers(new GreaterRegalOrb(), new OmenOfDextralExaltation())
    .apply(magic([p1]), ctxWithPool(thresholdPool, rngSequence([0])));
  assert.equal(dex.item.toState().suffixes[0]?.modId, "s50");
  assert.deepEqual(dex.cost, { greater_regal: 1, omen_dextral: 1 });
});

test("Chaos Orb removes one non-fractured affix, then adds into any open slot", () => {
  let addedPrefix = 0;
  let addedSuffix = 0;
  for (let i = 0; i < 500; i++) {
    const result = new ChaosOrb().apply(item([p1], [s1]), ctx(seededRng(i + 1)));
    const ids = modIds(result.item).filter(id => !["p1", "s1"].includes(id));
    for (const id of ids) {
      if (id.startsWith("p")) addedPrefix++;
      if (id.startsWith("s")) addedSuffix++;
    }
    assert.deepEqual(result.cost, { chaos: 1 });
  }
  assert.ok(addedPrefix > 0);
  assert.ok(addedSuffix > 0);
});

test("Chaos Orb cannot remove fractured affixes", () => {
  const result = new ChaosOrb().apply(item([p1], [s1], [p1]), ctx(rngSequence([0, 0])));
  assert.ok(result.item.toState().prefixes.some(m => m.modId === "p1"));
});

test("Greater and Perfect Chaos Orbs enforce the replacement required-level floor", () => {
  const thresholdPool: ModPool = {
    prefixes: [mod("p_low", "prefix", 20), mod("p_greater", "prefix", 35), mod("p_perfect", "prefix", 50)],
    suffixes: [mod("s_low", "suffix", 20), mod("s_greater", "suffix", 35), mod("s_perfect", "suffix", 50)],
  };

  const greater = new GreaterChaosOrb().apply(
    item([p1], [s1]),
    ctxWithPool(thresholdPool, rngSequence([0, 0, 0])),
  );
  const greaterAdded = greater.item.allMods().find(entry => !["p1", "s1"].includes(entry.modId));
  assert.ok((greaterAdded?.required_level ?? 0) >= 35);
  assert.deepEqual(greater.cost, { greater_chaos: 1 });

  const perfect = new PerfectChaosOrb().apply(
    item([p1], [s1]),
    ctxWithPool(thresholdPool, rngSequence([0, 0, 0])),
  );
  const perfectAdded = perfect.item.allMods().find(entry => !["p1", "s1"].includes(entry.modId));
  assert.ok((perfectAdded?.required_level ?? 0) >= 50);
  assert.deepEqual(perfect.cost, { perfect_chaos: 1 });
});

test("Tiered Chaos preserves fractured affixes and may replace across affix sides", () => {
  const replacementPool: ModPool = {
    prefixes: [mod("p50", "prefix", 50)],
    suffixes: [mod("s50", "suffix", 50)],
  };
  const result = new PerfectChaosOrb().apply(
    item([p1], [s1, s2], [p1]),
    ctxWithPool(replacementPool, rngSequence([0, 0, 0])),
  );
  const state = result.item.toState();
  assert.ok(state.prefixes.some(entry => entry.modId === "p1"));
  assert.equal(state.suffixes.length, 1);
  assert.ok(state.prefixes.some(entry => entry.modId === "p50"));
  assert.equal(removedEventId(result), "s1");
});

test("Whittling omen selects the lowest required-level removable affix and charges once", () => {
  const result = withModifiers(new ChaosOrb(), new OmenOfWhittling())
    .apply(item([p1], [s4]), ctx(rngSequence([0])));
  assert.equal(removedEventId(result), "p1");
  assert.deepEqual(result.cost, { chaos: 1, omen_whittling: 1 });
});

test("Sinistral/Dextral erasure omens target chaos removal side", () => {
  const sin = withModifiers(new ChaosOrb(), new OmenOfSinistralErasure())
    .apply(item([p1], [s1]), ctx(rngSequence([0, 0])));
  assert.equal(removedEventId(sin), "p1");

  const dex = withModifiers(new ChaosOrb(), new OmenOfDextralErasure())
    .apply(item([p1], [s1]), ctx(rngSequence([0, 0])));
  assert.equal(removedEventId(dex), "s1");
});

test("Whittling and erasure omens work with tiered Chaos Orbs", () => {
  const thresholdPool: ModPool = {
    prefixes: [mod("p50", "prefix", 50)],
    suffixes: [mod("s50", "suffix", 50)],
  };
  const whittling = withModifiers(new PerfectChaosOrb(), new OmenOfWhittling())
    .apply(item([p1], [s4]), ctxWithPool(thresholdPool, rngSequence([0, 0])));
  assert.equal(removedEventId(whittling), "p1");
  assert.deepEqual(whittling.cost, { perfect_chaos: 1, omen_whittling: 1 });

  const erasure = withModifiers(new GreaterChaosOrb(), new OmenOfDextralErasure())
    .apply(item([p1], [s1]), ctxWithPool(thresholdPool, rngSequence([0, 0])));
  assert.equal(removedEventId(erasure), "s1");
  assert.deepEqual(erasure.cost, { greater_chaos: 1, omen_dextral_erasure: 1 });
});

test("Annulment Orb removes one affix; Greater omen removes two", () => {
  const plain = new AnnulmentOrb().apply(item([p1, p2], [s1]), ctx(rngSequence([0])));
  assert.equal(countMods(plain.item), 2);
  assert.deepEqual(plain.cost, { annul: 1 });

  const greater = withModifiers(new AnnulmentOrb(), new OmenOfGreaterExaltation())
    .apply(item([p1, p2], [s1]), ctx(rngSequence([0, 0])));
  assert.equal(countMods(greater.item), 1);
  assert.deepEqual(greater.cost, { annul: 1, omen_greater: 1 });
});

test("Sinistral/Dextral annulment omens target removal side", () => {
  const sin = withModifiers(new AnnulmentOrb(), new OmenOfSinistralAnnulment())
    .apply(item([p1], [s1]), ctx(rngSequence([0])));
  assert.equal(sin.item.toState().prefixes.length, 0);
  assert.equal(sin.item.toState().suffixes.length, 1);

  const dex = withModifiers(new AnnulmentOrb(), new OmenOfDextralAnnulment())
    .apply(item([p1], [s1]), ctx(rngSequence([0])));
  assert.equal(dex.item.toState().prefixes.length, 1);
  assert.equal(dex.item.toState().suffixes.length, 0);
});

test("Fracturing Orb requires at least four mods and allows only one fractured affix", () => {
  const tooFew = new FracturingOrb().apply(item([p1], [s1]), ctx(rngSequence([0])));
  assert.equal(tooFew.item.fracturedModIds.size, 0);

  const first = new FracturingOrb().apply(item([p1, p2], [s1, s2]), ctx(rngSequence([0])));
  assert.equal(first.item.fracturedModIds.size, 1);
  const second = new FracturingOrb().apply(first.item, ctx(rngSequence([0.9])));
  assert.equal(second.item.fracturedModIds.size, 1);
  assert.deepEqual(first.cost, { fracturing_orb: 1 });
});

test("Greater Essence upgrades magic to rare and adds only the guaranteed mod", () => {
  const guaranteed = mod("guaranteed", "prefix", 1);
  const result = testEssence("greater_essence_test", guaranteed, "greater")
    .apply(magic([], [s1]), ctx(seededRng(9)));
  const state = result.item.toState();
  assert.equal(state.rarity, "rare");
  assert.ok(state.prefixes.some(m => m.modId === "guaranteed"));
  assert.ok(state.suffixes.some(m => m.modId === "s1"));
  assert.equal(countMods(result.item), 2);
  assert.deepEqual(result.cost, { greater_essence_test: 1 });
});

test("Greater Essence removes a same-side affix when the guaranteed side is full", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const result = testEssence("greater_essence_test", guaranteed, "greater")
    .apply(item([p1, p2, p3], [s1]), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.prefixes.length, 3);
  assert.ok(state.prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(state.suffixes.some(m => m.modId === "s1"));
  assert.equal(countMods(result.item), 4);
});

test("Essence catalog resolves different guaranteed mods by item type", () => {
  const oneHanded = EssenceCatalog.create("greater_essence_of_flames", "13")!;
  const twoHanded = EssenceCatalog.create("greater_essence_of_flames", "22")!;

  const oneHandedResult = oneHanded.apply(magic([], [s1]), ctx(rngSequence([0])));
  const twoHandedResult = twoHanded.apply(magic([], [s1]), ctx(rngSequence([0])));

  assert.ok(modIds(oneHandedResult.item).includes("LocalAddedFireDamage7"));
  assert.ok(modIds(twoHandedResult.item).includes("LocalAddedFireDamageTwoHand7"));
});

test("Essence catalog rejects unsupported item types and excludes lower-tier essences", () => {
  assert.equal(EssenceCatalog.create("perfect_essence_of_the_body", "1"), null);
  assert.ok(EssenceCatalog.create("perfect_essence_of_the_body", "45"));
  assert.equal(EssenceCatalog.create("essence_of_flames", "13"), null);
  assert.equal(EssenceCatalog.create("lesser_essence_of_flames", "13"), null);
  assert.ok(EssenceCatalog.definitions().every(essence => essence.tier === "greater" || essence.tier === "perfect"));
});

test("Essence catalog supports item-type-specific random guaranteed choices", () => {
  const essence = EssenceCatalog.create("greater_essence_of_the_infinite", "1")!;
  const first = essence.apply(magic([], [s1]), ctx(rngSequence([0])));
  const last = essence.apply(magic([], [s1]), ctx(rngSequence([0.999])));

  assert.notEqual(modIds(first.item).find(id => id !== "s1"), modIds(last.item).find(id => id !== "s1"));
});

test("Perfect Essence replaces one removable affix and supports crystallisation omens", () => {
  const guaranteedPrefix = mod("guaranteed_prefix", "prefix", 1);
  const base = item([p1], [s1]);

  const sin = withModifiers(
    testEssence("perfect_essence_test", guaranteedPrefix, "perfect"),
    new OmenOfSinistralCrystallisation(),
  ).apply(base, ctx(rngSequence([0])));
  assert.ok(!sin.item.toState().prefixes.some(m => m.modId === "p1"));
  assert.ok(sin.item.toState().prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(sin.item.toState().suffixes.some(m => m.modId === "s1"));

  const guaranteedSuffix = mod("guaranteed_suffix", "suffix", 1);
  const dex = withModifiers(
    testEssence("perfect_essence_test", guaranteedSuffix, "perfect"),
    new OmenOfDextralCrystallisation(),
  ).apply(base, ctx(rngSequence([0])));
  assert.ok(dex.item.toState().prefixes.some(m => m.modId === "p1"));
  assert.ok(!dex.item.toState().suffixes.some(m => m.modId === "s1"));
  assert.ok(dex.item.toState().suffixes.some(m => m.modId === "guaranteed_suffix"));
});

test("Perfect Essence removes a same-side affix when the guaranteed side is full", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const result = testEssence("perfect_essence_test", guaranteed, "perfect")
    .apply(item([p1, p2, p3], [s1]), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.prefixes.length, 3);
  assert.ok(state.prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(state.suffixes.some(m => m.modId === "s1"));
});

test("Omens reject incompatible ingredients", () => {
  assert.throws(
    () => withModifiers(new TransmutationOrb(), new OmenOfWhittling()).apply(CraftedItem.emptyNormal(), ctx()),
    /cannot apply/,
  );
});

test("Invalid Transmutation, Alchemy, Augmentation, and Regal uses are rejected without cost", () => {
  const rare = item([p1], [s1]);
  assertRejected(new TransmutationOrb().apply(rare, ctx()), rare);
  assertRejected(new AlchemyOrb().apply(rare, ctx()), rare);

  const fullMagic = magic([p1], [s1]);
  assertRejected(new AugmentationOrb().apply(fullMagic, ctx()), fullMagic);
  assertRejected(new RegalOrb().apply(rare, ctx()), rare);
});

test("Invalid tiered Transmutation, Augmentation, Regal, and Chaos uses are rejected without cost", () => {
  const rare = item([p1], [s1]);
  const fullMagic = magic([p1], [s1]);
  const magicItem = magic([p1]);

  for (const ingredient of [new GreaterTransmutationOrb(), new PerfectTransmutationOrb()]) {
    assertRejected(ingredient.apply(rare, ctx()), rare);
  }
  for (const ingredient of [new GreaterAugmentationOrb(), new PerfectAugmentationOrb()]) {
    assertRejected(ingredient.apply(fullMagic, ctx()), fullMagic);
  }
  for (const ingredient of [new GreaterRegalOrb(), new PerfectRegalOrb()]) {
    assertRejected(ingredient.apply(rare, ctx()), rare);
  }
  for (const ingredient of [new GreaterChaosOrb(), new PerfectChaosOrb()]) {
    assertRejected(ingredient.apply(magicItem, ctx()), magicItem);
  }
});

test("Invalid Exalt, Chaos, Annulment, and Fracturing uses are rejected without cost", () => {
  const fullRare = item([p1, p2, p3], [s1, s2, s3]);
  assertRejected(new ExaltedOrb().apply(fullRare, ctx()), fullRare);

  const magicItem = magic([p1], [s1]);
  assertRejected(new ChaosOrb().apply(magicItem, ctx()), magicItem);
  assertRejected(new AnnulmentOrb().apply(magicItem, ctx()), magicItem);

  const tooFew = item([p1], [s1]);
  assertRejected(new FracturingOrb().apply(tooFew, ctx()), tooFew);
});

test("Invalid Greater/Perfect Essence uses are rejected without cost", () => {
  const guaranteed = mod("guaranteed", "prefix", 1);
  const normal = CraftedItem.emptyNormal();
  const magicItem = magic([p1], [s1]);

  assertRejected(testEssence("greater_essence_test", guaranteed, "greater").apply(normal, ctx()), normal);
  assertRejected(testEssence("perfect_essence_test", guaranteed, "perfect").apply(magicItem, ctx()), magicItem);
});

test("An omen is not consumed when its ingredient use is rejected", () => {
  const fullRare = item([p1, p2, p3], [s1, s2, s3]);
  const result = withModifiers(new ExaltedOrb(), new OmenOfGreaterExaltation()).apply(fullRare, ctx());
  assertRejected(result, fullRare);
  assert.equal(result.cost.omen_greater, undefined);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed++;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  throw new Error(`${failed} rule test(s) failed`);
}

console.log(`\n${tests.length} rule tests passed`);
