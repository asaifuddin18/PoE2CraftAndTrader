import assert from "node:assert/strict";
import { CraftedItem } from "./domain/CraftedItem";
import { applyCraftingIngredient } from "./domain/applyCraftingIngredient";
import { EssenceCatalog } from "./domain/EssenceCatalog";
import { AlloyCatalog } from "./domain/AlloyCatalog";
import { CatalystCatalog } from "./domain/CatalystCatalog";
import { DesecrationBoneCatalog } from "./domain/DesecrationBoneCatalog";
import type { CraftContext } from "./domain/CraftContext";
import {
  AlchemyOrb,
  Alloy,
  AnnulmentOrb,
  AugmentationOrb,
  ChaosOrb,
  DesecrationBone,
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
  RevealDesecratedModifier,
  TransmutationOrb,
} from "./ingredients";
import {
  OmenOfDextralAnnulment,
  OmenOfDextralAlchemy,
  OmenOfDextralCrystallisation,
  OmenOfDextralCoronation,
  OmenOfDextralErasure,
  OmenOfDextralExaltation,
  OmenOfGreaterAnnulment,
  OmenOfGreaterExaltation,
  OmenOfCatalysingExaltation,
  OmenOfLight,
  OmenOfAbyssalEchoes,
  OmenOfDextralNecromancy,
  OmenOfPutrefaction,
  OmenOfSinistralNecromancy,
  OmenOfTheBlackblooded,
  OmenOfTheLiege,
  OmenOfTheSovereign,
  OmenOfSinistralAnnulment,
  OmenOfSinistralAlchemy,
  OmenOfSinistralCrystallisation,
  OmenOfSinistralCoronation,
  OmenOfSinistralErasure,
  OmenOfSinistralExaltation,
  OmenOfWhittling,
  withModifiers,
} from "./modifiers";
import { build_craft_pools, build_pools } from "./engine";
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

function ctxWithPools(normal: ModPool, desecrationPool: ModPool, rng: () => number = rngSequence([0])): CraftContext {
  return { pool: normal, desecrationPool, rng };
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

function corrupted(item: CraftedItem): CraftedItem {
  return CraftedItem.fromState({ ...item.toState(), corrupted: true });
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

test("Transmutation and Augmentation variants fail without cost when no eligible affix exists", () => {
  const lowPool: ModPool = {
    prefixes: [mod("p_low_only", "prefix", 20)],
    suffixes: [mod("s_low_only", "suffix", 20)],
  };
  const emptyPool: ModPool = { prefixes: [], suffixes: [] };
  const normal = CraftedItem.emptyNormal();
  const onePrefix = magic([p1]);

  assertRejected(new TransmutationOrb().apply(normal, ctxWithPool(emptyPool)), normal);
  assertRejected(new GreaterTransmutationOrb().apply(normal, ctxWithPool(lowPool)), normal);
  assertRejected(new PerfectTransmutationOrb().apply(normal, ctxWithPool(lowPool)), normal);

  assertRejected(new AugmentationOrb().apply(onePrefix, ctxWithPool(emptyPool)), onePrefix);
  assertRejected(new GreaterAugmentationOrb().apply(onePrefix, ctxWithPool(lowPool)), onePrefix);
  assertRejected(new PerfectAugmentationOrb().apply(onePrefix, ctxWithPool(lowPool)), onePrefix);
});

test("Augmentation requires a magic item with exactly one affix", () => {
  const emptyMagic = magic([]);
  const fullMagic = magic([p1], [s1]);
  assertRejected(new AugmentationOrb().apply(emptyMagic, ctx()), emptyMagic);
  assertRejected(new AugmentationOrb().apply(fullMagic, ctx()), fullMagic);
});

test("No omen modifies Transmutation or Augmentation", () => {
  assert.throws(
    () => withModifiers(new TransmutationOrb(), new OmenOfSinistralExaltation())
      .apply(CraftedItem.emptyNormal(), ctx()),
    /cannot apply/,
  );
  assert.throws(
    () => withModifiers(new AugmentationOrb(), new OmenOfSinistralExaltation())
      .apply(magic([p1]), ctx()),
    /cannot apply/,
  );
});

test("Regal Orb upgrades magic to rare and adds one affix", () => {
  const result = new RegalOrb().apply(magic([p1]), ctx(rngSequence([0.9, 0])));
  const state = result.item.toState();
  assert.equal(state.rarity, "rare");
  assert.equal(countMods(result.item), 2);
  assert.deepEqual(result.cost, { regal: 1 });
});

test("Alchemy Orb makes a rare item with exactly four random affixes", () => {
  const result = new AlchemyOrb().apply(CraftedItem.emptyNormal(), ctx(seededRng(4)));
  const state = result.item.toState();
  assert.equal(state.rarity, "rare");
  assert.equal(countMods(result.item), 4);
  assert.deepEqual(result.cost, { alch: 1 });
});

test("Alchemy Orb replaces a magic item's existing affixes with four new affixes", () => {
  const result = new AlchemyOrb().apply(magic([p1], [s1]), ctxWithPool({
    prefixes: [mod("new_p1", "prefix"), mod("new_p2", "prefix"), mod("new_p3", "prefix")],
    suffixes: [mod("new_s1", "suffix"), mod("new_s2", "suffix"), mod("new_s3", "suffix")],
  }, seededRng(4)));

  assert.equal(result.item.rarity, "rare");
  assert.equal(countMods(result.item), 4);
  assert.ok(!modIds(result.item).includes("p1"));
  assert.ok(!modIds(result.item).includes("s1"));
  assert.deepEqual(result.cost, { alch: 1 });
});

test("Sinistral and Dextral Alchemy omens maximize prefixes and suffixes", () => {
  const sinistral = withModifiers(new AlchemyOrb(), new OmenOfSinistralAlchemy())
    .apply(CraftedItem.emptyNormal(), ctx(seededRng(4)));
  assert.equal(sinistral.item.toState().prefixes.length, 3);
  assert.equal(sinistral.item.toState().suffixes.length, 1);
  assert.deepEqual(sinistral.cost, { alch: 1, omen_sinistral_alchemy: 1 });

  const dextral = withModifiers(new AlchemyOrb(), new OmenOfDextralAlchemy())
    .apply(CraftedItem.emptyNormal(), ctx(seededRng(4)));
  assert.equal(dextral.item.toState().prefixes.length, 1);
  assert.equal(dextral.item.toState().suffixes.length, 3);
  assert.deepEqual(dextral.cost, { alch: 1, omen_dextral_alchemy: 1 });
});

test("Alchemy and its omens fail atomically unless exactly four affixes can be added", () => {
  const suffixOnlyPool: ModPool = {
    prefixes: [],
    suffixes: [mod("only_s1", "suffix"), mod("only_s2", "suffix"), mod("only_s3", "suffix")],
  };
  const normal = CraftedItem.emptyNormal();
  assertRejected(
    withModifiers(new AlchemyOrb(), new OmenOfSinistralAlchemy())
      .apply(normal, ctxWithPool(suffixOnlyPool, rngSequence([0]))),
    normal,
  );

  const magicItem = magic([p1], [s1]);
  assertRejected(
    new AlchemyOrb().apply(magicItem, ctxWithPool(suffixOnlyPool, rngSequence([0]))),
    magicItem,
  );
});

test("Observable ingredient application logs rejected crafts", () => {
  const messages: string[] = [];
  const originalWarn = console.warn;
  console.warn = message => messages.push(String(message));
  try {
    const rare = item([p1], [s1]);
    assertRejected(applyCraftingIngredient(new AlchemyOrb(), rare, ctx()), rare);
  } finally {
    console.warn = originalWarn;
  }

  const logged = JSON.parse(messages[0]) as Record<string, unknown>;
  assert.equal(logged.event, "craft_failure");
  assert.equal(logged.ingredientId, "alch");
  assert.equal(logged.rarity, "rare");
  assert.match(String(logged.reason), /normal or magic/);
});

test("Exaltation omens are not Alchemy omens", () => {
  assert.throws(
    () => withModifiers(new AlchemyOrb(), new OmenOfSinistralExaltation())
      .apply(CraftedItem.emptyNormal(), ctx()),
    /cannot apply/,
  );
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

test("Sinistral and Dextral Exaltation omens work with all Exalted Orb variants", () => {
  const highPool: ModPool = {
    prefixes: [mod("p50", "prefix", 50)],
    suffixes: [mod("s50", "suffix", 50)],
  };
  const variants = [new ExaltedOrb(), new GreaterExaltedOrb(), new PerfectExaltedOrb()];

  for (const ingredient of variants) {
    const sin = withModifiers(ingredient, new OmenOfSinistralExaltation())
      .apply(item([], []), ctxWithPool(highPool, rngSequence([0])));
    assert.equal(sin.item.toState().prefixes.length, 1);
    assert.equal(sin.item.toState().suffixes.length, 0);
    assert.equal(sin.cost[ingredient.id], 1);
    assert.equal(sin.cost.omen_sinistral, 1);

    const dex = withModifiers(ingredient, new OmenOfDextralExaltation())
      .apply(item([], []), ctxWithPool(highPool, rngSequence([0])));
    assert.equal(dex.item.toState().prefixes.length, 0);
    assert.equal(dex.item.toState().suffixes.length, 1);
    assert.equal(dex.cost[ingredient.id], 1);
    assert.equal(dex.cost.omen_dextral, 1);
  }
});

test("Exaltation omens fail without cost when their side has no slot or eligible affix", () => {
  const noPrefixPool: ModPool = { prefixes: [], suffixes: [s1] };
  const noSuffixPool: ModPool = { prefixes: [p1], suffixes: [] };
  const noPrefixSlot = item([p1, p2, p3], [s1]);
  const noSuffixSlot = item([p1], [s1, s2, s3]);

  assertRejected(
    withModifiers(new ExaltedOrb(), new OmenOfSinistralExaltation())
      .apply(item([], []), ctxWithPool(noPrefixPool)),
    item([], []),
  );
  assertRejected(
    withModifiers(new PerfectExaltedOrb(), new OmenOfDextralExaltation())
      .apply(item([], []), ctxWithPool(noSuffixPool)),
    item([], []),
  );
  assertRejected(
    withModifiers(new ExaltedOrb(), new OmenOfSinistralExaltation()).apply(noPrefixSlot, ctx()),
    noPrefixSlot,
  );
  assertRejected(
    withModifiers(new ExaltedOrb(), new OmenOfDextralExaltation()).apply(noSuffixSlot, ctx()),
    noSuffixSlot,
  );
});

test("Greater Exaltation combines with side-specific Exaltation to add two affixes atomically", () => {
  const highPool: ModPool = {
    prefixes: [mod("p50a", "prefix", 50), mod("p50b", "prefix", 50)],
    suffixes: [mod("s50a", "suffix", 50), mod("s50b", "suffix", 50)],
  };
  const result = withModifiers(
    new PerfectExaltedOrb(),
    new OmenOfGreaterExaltation(),
    new OmenOfSinistralExaltation(),
  ).apply(item([], []), ctxWithPool(highPool, rngSequence([0, 0])));

  assert.equal(result.item.toState().prefixes.length, 2);
  assert.equal(result.item.toState().suffixes.length, 0);
  assert.deepEqual(result.cost, { perfect_exalt: 1, omen_greater: 1, omen_sinistral: 1 });
});

test("Greater Exaltation failures are atomic and consume nothing", () => {
  const onlyOneEligiblePrefix: ModPool = {
    prefixes: [mod("only_prefix", "prefix", 50)],
    suffixes: [],
  };
  const original = item([], [s1]);
  const result = withModifiers(
    new PerfectExaltedOrb(),
    new OmenOfGreaterExaltation(),
    new OmenOfSinistralExaltation(),
  ).apply(original, ctxWithPool(onlyOneEligiblePrefix, rngSequence([0, 0])));

  assertRejected(result, original);
});

test("Sinistral and Dextral Coronation omens work with all Regal Orb variants", () => {
  const thresholdPool: ModPool = {
    prefixes: [mod("p50", "prefix", 50)],
    suffixes: [mod("s50", "suffix", 50)],
  };
  const variants = [new RegalOrb(), new GreaterRegalOrb(), new PerfectRegalOrb()];

  for (const ingredient of variants) {
    const sin = withModifiers(ingredient, new OmenOfSinistralCoronation())
      .apply(magic([], [s1]), ctxWithPool(thresholdPool, rngSequence([0])));
    assert.equal(sin.item.toState().prefixes[0]?.modId, "p50");
    assert.equal(sin.cost[ingredient.id], 1);
    assert.equal(sin.cost.omen_sinistral_coronation, 1);

    const dex = withModifiers(ingredient, new OmenOfDextralCoronation())
      .apply(magic([p1]), ctxWithPool(thresholdPool, rngSequence([0])));
    assert.equal(dex.item.toState().suffixes[0]?.modId, "s50");
    assert.equal(dex.cost[ingredient.id], 1);
    assert.equal(dex.cost.omen_dextral_coronation, 1);
  }
});

test("Coronation omens fail without cost when their side has no eligible Regal affix", () => {
  const noPrefixPool: ModPool = { prefixes: [], suffixes: [s1] };
  const noSuffixPool: ModPool = { prefixes: [p1], suffixes: [] };
  const magicWithSuffix = magic([], [s1]);
  const magicWithPrefix = magic([p1]);

  assertRejected(
    withModifiers(new RegalOrb(), new OmenOfSinistralCoronation())
      .apply(magicWithSuffix, ctxWithPool(noPrefixPool)),
    magicWithSuffix,
  );
  assertRejected(
    withModifiers(new PerfectRegalOrb(), new OmenOfDextralCoronation())
      .apply(magicWithPrefix, ctxWithPool(noSuffixPool)),
    magicWithPrefix,
  );
});

test("Exaltation omens are not Coronation omens", () => {
  assert.throws(
    () => withModifiers(new RegalOrb(), new OmenOfSinistralExaltation())
      .apply(magic([], [s1]), ctx()),
    /cannot apply/,
  );
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

test("Chaos Orb fails atomically when it cannot remove or add an eligible affix", () => {
  const allFractured = item([p1], [s1], [p1, s1]);
  assertRejected(new ChaosOrb().apply(allFractured, ctx()), allFractured);

  const noReplacementPool: ModPool = { prefixes: [], suffixes: [] };
  const original = item([p1], [s1]);
  assertRejected(
    new ChaosOrb().apply(original, ctxWithPool(noReplacementPool, rngSequence([0]))),
    original,
  );
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

test("Erasure omens fail without cost when their removal side has no eligible affix", () => {
  const noPrefix = item([], [s1]);
  const noSuffix = item([p1], []);
  assertRejected(
    withModifiers(new ChaosOrb(), new OmenOfSinistralErasure()).apply(noPrefix, ctx()),
    noPrefix,
  );
  assertRejected(
    withModifiers(new ChaosOrb(), new OmenOfDextralErasure()).apply(noSuffix, ctx()),
    noSuffix,
  );
});

test("Whittling combines with Erasure to remove the lowest-level affix from that side", () => {
  const result = withModifiers(
    new PerfectChaosOrb(),
    new OmenOfWhittling(),
    new OmenOfSinistralErasure(),
  ).apply(
    item([p4, p1], [s1]),
    ctxWithPool({
      prefixes: [mod("replacement_p50", "prefix", 50)],
      suffixes: [mod("replacement_s50", "suffix", 50)],
    }, rngSequence([0, 0])),
  );

  assert.equal(removedEventId(result), "p1");
  assert.deepEqual(result.cost, {
    perfect_chaos: 1,
    omen_whittling: 1,
    omen_sinistral_erasure: 1,
  });
});

test("Conflicting Erasure omens cannot be combined", () => {
  assert.throws(
    () => withModifiers(
      new ChaosOrb(),
      new OmenOfSinistralErasure(),
      new OmenOfDextralErasure(),
    ).apply(item([p1], [s1]), ctx()),
    /cannot be combined/,
  );
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

test("Annulment Orb removes one non-fractured affix from magic or rare items", () => {
  const plain = new AnnulmentOrb().apply(item([p1, p2], [s1]), ctx(rngSequence([0])));
  assert.equal(countMods(plain.item), 2);
  assert.deepEqual(plain.cost, { annul: 1 });

  const magicResult = new AnnulmentOrb().apply(magic([p1], [s1]), ctx(rngSequence([0])));
  assert.equal(countMods(magicResult.item), 1);
  assert.deepEqual(magicResult.cost, { annul: 1 });

  const fractured = new AnnulmentOrb().apply(item([p1], [s1], [p1]), ctx(rngSequence([0])));
  assert.ok(fractured.item.toState().prefixes.some(entry => entry.modId === "p1"));
  assert.equal(fractured.item.toState().suffixes.length, 0);
});

test("Omen of Greater Annulment removes two affixes and charges once", () => {
  const greater = withModifiers(new AnnulmentOrb(), new OmenOfGreaterAnnulment())
    .apply(item([p1, p2], [s1]), ctx(rngSequence([0, 0])));
  assert.equal(countMods(greater.item), 1);
  assert.deepEqual(greater.cost, { annul: 1, omen_greater_annulment: 1 });
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

test("Side-specific annulment fails without cost when its side has no removable affix", () => {
  const noPrefix = item([], [s1]);
  const noSuffix = item([p1], []);
  assertRejected(
    withModifiers(new AnnulmentOrb(), new OmenOfSinistralAnnulment()).apply(noPrefix, ctx()),
    noPrefix,
  );
  assertRejected(
    withModifiers(new AnnulmentOrb(), new OmenOfDextralAnnulment()).apply(noSuffix, ctx()),
    noSuffix,
  );
});

test("Greater and Sinistral Annulment omens combine to remove two prefixes", () => {
  const result = withModifiers(
    new AnnulmentOrb(),
    new OmenOfGreaterAnnulment(),
    new OmenOfSinistralAnnulment(),
  ).apply(item([p1, p2], [s1]), ctx(rngSequence([0, 0])));

  assert.deepEqual(result.item.toState().prefixes, []);
  assert.equal(result.item.toState().suffixes.length, 1);
  assert.deepEqual(result.cost, {
    annul: 1,
    omen_greater_annulment: 1,
    omen_sinistral_annulment: 1,
  });
});

test("Combined Greater and side-specific Annulment fails atomically without two removable affixes", () => {
  const onlyOneRemovablePrefix = item([p1, p2], [s1], [p2]);
  const result = withModifiers(
    new AnnulmentOrb(),
    new OmenOfGreaterAnnulment(),
    new OmenOfSinistralAnnulment(),
  ).apply(onlyOneRemovablePrefix, ctx(rngSequence([0, 0])));

  assertRejected(result, onlyOneRemovablePrefix);
});

test("Conflicting side-specific annulment omens cannot be combined", () => {
  assert.throws(
    () => withModifiers(
      new AnnulmentOrb(),
      new OmenOfSinistralAnnulment(),
      new OmenOfDextralAnnulment(),
    ).apply(item([p1], [s1]), ctx()),
    /cannot be combined/,
  );
});

test("Fracturing Orb requires a rare item with at least four affixes and no existing fracture", () => {
  const magicItem = magic([p1], [s1]);
  assertRejected(new FracturingOrb().apply(magicItem, ctx()), magicItem);

  const tooFew = new FracturingOrb().apply(item([p1], [s1]), ctx(rngSequence([0])));
  assertRejected(tooFew, item([p1], [s1]));

  const first = new FracturingOrb().apply(item([p1, p2], [s1, s2]), ctx(rngSequence([0])));
  assert.equal(first.item.fracturedModIds.size, 1);
  const second = new FracturingOrb().apply(first.item, ctx(rngSequence([0.9])));
  assertRejected(second, first.item);
  assert.deepEqual(first.cost, { fracturing_orb: 1 });
});

test("Fracturing Orb can select any affix regardless of side or required level", () => {
  const base = item([p1, p4], [s1, s4]);
  const first = new FracturingOrb().apply(base, ctx(rngSequence([0])));
  const last = new FracturingOrb().apply(base, ctx(rngSequence([0.999])));

  assert.ok(first.item.fracturedModIds.has("p1"));
  assert.ok(last.item.fracturedModIds.has("s4"));
});

test("Fracturing Orb has no compatible omen", () => {
  assert.throws(
    () => withModifiers(new FracturingOrb(), new OmenOfWhittling())
      .apply(item([p1, p2], [s1, s2]), ctx()),
    /cannot apply/,
  );
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

test("Greater Essence rejects rare items and impossible full guaranteed sides without cost", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const rare = item([p1], [s1]);
  assertRejected(testEssence("greater_essence_test", guaranteed, "greater").apply(rare, ctx()), rare);

  const invalidFullMagic = magic([p1, p2, p3], [s1]);
  assertRejected(
    testEssence("greater_essence_test", guaranteed, "greater").apply(invalidFullMagic, ctx()),
    invalidFullMagic,
  );
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

test("Perfect Essence removes any random affix when the guaranteed side already has room", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const result = testEssence("perfect_essence_test", guaranteed, "perfect")
    .apply(item([p1], [s1]), ctx(rngSequence([0, 0.999])));

  assert.ok(result.item.toState().prefixes.some(m => m.modId === "p1"));
  assert.ok(result.item.toState().prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.equal(result.item.toState().suffixes.length, 0);
});

test("Perfect Essence and Crystallisation fail atomically when removal cannot create guaranteed-side room", () => {
  const guaranteedPrefix = mod("guaranteed_prefix", "prefix", 1);
  const full = item([p1, p2, p3], [s1, s2, s3]);
  const result = withModifiers(
    testEssence("perfect_essence_test", guaranteedPrefix, "perfect"),
    new OmenOfDextralCrystallisation(),
  ).apply(full, ctx(rngSequence([0, 0])));

  assertRejected(result, full);
});

test("Crystallisation fails without cost when its requested removal side is unavailable", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const noSuffix = item([p1], []);
  const result = withModifiers(
    testEssence("perfect_essence_test", guaranteed, "perfect"),
    new OmenOfDextralCrystallisation(),
  ).apply(noSuffix, ctx(rngSequence([0])));

  assertRejected(result, noSuffix);
});

test("Crystallisation omens apply only to Perfect Essences", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  assert.throws(
    () => withModifiers(
      testEssence("greater_essence_test", guaranteed, "greater"),
      new OmenOfSinistralCrystallisation(),
    ).apply(magic([], [s1]), ctx()),
    /cannot apply/,
  );
});

test("Alloy removes one random affix and adds its item-specific guaranteed modifier", () => {
  const alloy = AlloyCatalog.create("the_runefathers_alloy", "25", 52)!;
  const result = alloy.apply(item([p1], [s1]), ctx(rngSequence([0])));

  assert.equal(countMods(result.item), 2);
  assert.ok(!modIds(result.item).includes("p1"));
  assert.ok(modIds(result.item).includes("the_runefathers_alloy_quarterstaff"));
  assert.deepEqual(result.cost, { the_runefathers_alloy: 1 });
});

test("Alloy catalog enforces equipment applicability and guaranteed-modifier required level", () => {
  assert.ok(AlloyCatalog.create("the_runefathers_alloy", "25", 52));
  assert.equal(AlloyCatalog.create("the_runefathers_alloy", "25", 51), null);
  assert.equal(AlloyCatalog.create("the_runefathers_alloy", "1", 82), null);
  assert.equal(AlloyCatalog.create("celestial_alloy", "11", 82), null);
  assert.ok(AlloyCatalog.create("runic_alloy", "1", 10));
  assert.equal(AlloyCatalog.create("runic_alloy", "1", 9), null);
  assert.equal(AlloyCatalog.definitions().length, 13);
  assert.ok(AlloyCatalog.definitions().some(definition => definition.id === "swift_alloy"));
});

test("Alloy forces same-side removal only when its guaranteed side is full", () => {
  const guaranteedPrefix = mod("alloy_prefix", "prefix");
  const alloy = new Alloy("test_alloy", "Test Alloy", guaranteedPrefix);
  const fullPrefix = item([p1, p2, p3], [s1]);
  const forced = alloy.apply(fullPrefix, ctx(rngSequence([0.999])));

  assert.equal(forced.item.prefixes.length, 3);
  assert.ok(forced.item.prefixes.some(candidate => candidate.modId === "alloy_prefix"));
  assert.ok(forced.item.suffixes.some(candidate => candidate.modId === "s1"));

  const room = item([p1], [s1]);
  const eitherSide = alloy.apply(room, ctx(rngSequence([0.999])));
  assert.ok(eitherSide.item.prefixes.some(candidate => candidate.modId === "p1"));
  assert.equal(eitherSide.item.suffixes.length, 0);
});

test("Alloy excludes fractured affixes and fails atomically when no valid removal can make room", () => {
  const guaranteedPrefix = mod("alloy_prefix", "prefix");
  const alloy = new Alloy("test_alloy", "Test Alloy", guaranteedPrefix);
  const blocked = item([p1, p2, p3], [s1], [p1, p2, p3]);

  assertRejected(alloy.apply(blocked, ctx(rngSequence([0]))), blocked);
});

test("Guaranteed-modifier ingredients reject an already-present modifier group without cost", () => {
  const guaranteed = { ...mod("alloy_guaranteed", "suffix"), group: "exclusive_guaranteed_group" };
  const existing = { ...mod("existing_same_group", "suffix"), group: "exclusive_guaranteed_group" };
  const base = item([p1], [existing]);

  assertRejected(new Alloy("test_alloy", "Test Alloy", guaranteed).apply(base, ctx()), base);
  assertRejected(testEssence("perfect_essence_test", guaranteed, "perfect").apply(base, ctx()), base);
});

test("Different Alloy guaranteed modifier groups can coexist", () => {
  const first = new Alloy("first_alloy", "First Alloy", mod("first_alloy_mod", "prefix"));
  const second = new Alloy("second_alloy", "Second Alloy", mod("second_alloy_mod", "suffix"));
  const firstResult = first.apply(item([p1], [s1]), ctx(rngSequence([0])));
  const secondResult = second.apply(firstResult.item, ctx(rngSequence([0.999])));

  assert.equal(secondResult.applied, true);
  assert.ok(modIds(secondResult.item).includes("first_alloy_mod"));
  assert.ok(modIds(secondResult.item).includes("second_alloy_mod"));
});

test("Alloy requires rare, uncorrupted items and has no compatible omens", () => {
  const alloy = new Alloy("test_alloy", "Test Alloy", mod("alloy_mod", "prefix"));
  const magicItem = magic([p1], [s1]);
  const corruptedRare = corrupted(item([p1], [s1]));

  assertRejected(alloy.apply(magicItem, ctx()), magicItem);
  assertRejected(alloy.apply(corruptedRare, ctx()), corruptedRare);
  assert.throws(() => withModifiers(alloy, new OmenOfWhittling()).apply(item([p1], [s1]), ctx()), /cannot apply/);
});

test("Catalysts add rarity-scaled quality and replace other Catalyst quality types", () => {
  const flesh = CatalystCatalog.create("flesh_catalyst", "1")!;
  const neural = CatalystCatalog.create("neural_catalyst", "1")!;

  const normal = flesh.apply(CraftedItem.emptyNormal(), ctx()).item;
  assert.deepEqual(normal.catalyst, { type: "life", amount: 5, maximum: 20 });
  const magicResult = flesh.apply(magic([p1]), ctx()).item;
  assert.deepEqual(magicResult.catalyst, { type: "life", amount: 2, maximum: 20 });
  const rareResult = flesh.apply(item([p1], [s1]), ctx()).item;
  assert.deepEqual(rareResult.catalyst, { type: "life", amount: 1, maximum: 20 });

  const replaced = neural.apply(rareResult, ctx()).item;
  assert.deepEqual(replaced.catalyst, { type: "mana", amount: 1, maximum: 20 });
});

test("Catalyst respects explicit quality caps and rejects use at maximum without cost", () => {
  const catalyst = CatalystCatalog.create("adaptive_catalyst", "1")!;
  const breachRing = item([p1], [s1]).setCatalyst("attribute", 39, 40);
  const filled = catalyst.apply(breachRing, ctx());
  assert.deepEqual(filled.item.catalyst, { type: "attribute", amount: 40, maximum: 40 });
  assertRejected(catalyst.apply(filled.item, ctx()), filled.item);
});

test("Catalyst catalog includes 12 jewellery Catalysts and rejects unsupported equipment", () => {
  assert.equal(CatalystCatalog.definitions().length, 12);
  assert.ok(CatalystCatalog.create("flesh_catalyst", "1"));
  assert.ok(CatalystCatalog.create("flesh_catalyst", "2"));
  assert.equal(CatalystCatalog.create("flesh_catalyst", "25"), null);
});

test("Catalysing Exaltation boosts matching tagged modifiers and consumes quality after success", () => {
  const life = { ...mod("life_mod", "prefix"), tags: ["Life"] };
  const mana = { ...mod("mana_mod", "prefix"), tags: ["Mana"] };
  const base = item([], [s1]).setCatalyst("life", 20, 20);
  const result = withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation())
    .apply(base, ctxWithPool({ prefixes: [life, mana], suffixes: [] }, rngSequence([0, 0.7])));

  assert.equal(result.applied, true);
  assert.ok(modIds(result.item).includes("life_mod"));
  assert.deepEqual(result.item.catalyst, { type: "life", amount: 0, maximum: 20 });
  assert.deepEqual(result.cost, { exalt: 1, omen_catalysing_exaltation: 1 });
});

test("Catalysing Exaltation supports verified 40% quality and configurable intermediate multipliers", () => {
  const life = { ...mod("life_mod", "prefix"), tags: ["Life"] };
  const mana = { ...mod("mana_mod", "prefix"), tags: ["Mana"] };
  const customPool = { prefixes: [life, mana], suffixes: [] };

  const forty = item([], [s1]).setCatalyst("life", 40, 40);
  assert.equal(
    withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation())
      .apply(forty, ctxWithPool(customPool, rngSequence([0, 0.8]))).applied,
    true,
  );

  const ten = item([], [s1]).setCatalyst("life", 10, 20);
  assertRejected(
    withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation())
      .apply(ten, ctxWithPool(customPool, rngSequence([0, 0.6]))),
    ten,
  );
  assert.equal(
    withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation({ 10: 3 }))
      .apply(ten, ctxWithPool(customPool, rngSequence([0, 0.6]))).applied,
    true,
  );
});

test("Catalysing Exaltation combines with Greater and side-specific Exaltation", () => {
  const lifePrefix = { ...mod("life_prefix", "prefix"), tags: ["Life"] };
  const otherPrefix = { ...mod("other_prefix", "prefix"), tags: ["Mana"] };
  const base = item([p1], [s1, s2, s3]).setCatalyst("life", 20, 20);
  const result = withModifiers(
    new ExaltedOrb(),
    new OmenOfCatalysingExaltation(),
    new OmenOfGreaterExaltation(),
    new OmenOfSinistralExaltation(),
  ).apply(base, ctxWithPool({ prefixes: [lifePrefix, otherPrefix], suffixes: [] }, rngSequence([0, 0.7, 0, 0])));

  assert.equal(result.applied, true);
  assert.ok(modIds(result.item).includes("life_prefix"));
  assert.ok(modIds(result.item).includes("other_prefix"));
  assert.deepEqual(result.item.catalyst, { type: "life", amount: 0, maximum: 20 });
});

test("Failed Catalysing Exaltation consumes neither quality nor omen", () => {
  const full = item([p1, p2, p3], [s1, s2, s3]).setCatalyst("life", 20, 20);
  const result = withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation()).apply(full, ctx());
  assertRejected(result, full);
  assert.deepEqual(result.item.catalyst, { type: "life", amount: 20, maximum: 20 });
});

test("Desecration Bone adds a hidden Desecrated affix to a rare item", () => {
  const result = new DesecrationBone("jawbone", "preserved")
    .apply(item([p1], [s1]), ctx(rngSequence([0])));
  const hidden = result.item.allMods().find(mod => mod.hidden);

  assert.equal(result.applied, true);
  assert.ok(hidden?.desecrated);
  assert.equal(hidden?.gen_type, "prefix");
  assert.deepEqual(result.cost, { preserved_jawbone: 1 });
});

test("Desecration Bone removes a same-side non-fractured affix on full items", () => {
  const full = item([p1, p2, p3], [s1, s2, s3], [p1, p2, p3]);
  const result = new DesecrationBone("rib", "preserved").apply(full, ctx(rngSequence([0])));
  const hidden = result.item.allMods().find(mod => mod.hidden);

  assert.equal(result.applied, true);
  assert.equal(hidden?.gen_type, "suffix");
  assert.ok(result.item.suffixes.some(mod => mod.hidden));
  assert.deepEqual(result.item.prefixes.map(mod => mod.modId).sort(), ["p1", "p2", "p3"]);
});

test("Desecration Bone rejects invalid rarity, Gnawed ilvl, existing Desecration, and impossible removal", () => {
  const magicItem = magic([p1]);
  assertRejected(new DesecrationBone("jawbone", "gnawed").apply(magicItem, { ...ctx(), itemLevel: 64 }), magicItem);

  const rare = item([p1], [s1]);
  assertRejected(new DesecrationBone("jawbone", "gnawed").apply(rare, { ...ctx(), itemLevel: 65 }), rare);

  const desecrated = item([{ ...p1, desecrated: true }], [s1]);
  assertRejected(new DesecrationBone("jawbone", "preserved").apply(desecrated, ctx()), desecrated);

  const fullAllFractured = item([p1, p2, p3], [s1, s2, s3], [p1, p2, p3, s1, s2, s3]);
  assertRejected(new DesecrationBone("jawbone", "preserved").apply(fullAllFractured, ctx()), fullAllFractured);
});

test("Desecration Bone catalog resolves bone types by equipment category", () => {
  assert.ok(DesecrationBoneCatalog.create("preserved", "jawbone", "25"));
  assert.ok(DesecrationBoneCatalog.create("preserved", "rib", "45"));
  assert.ok(DesecrationBoneCatalog.create("preserved", "collarbone", "1"));
  assert.equal(DesecrationBoneCatalog.create("preserved", "jawbone", "1"), null);
  assert.equal(DesecrationBoneCatalog.create("preserved", "cranium", "1"), null);
  assert.throws(() => new DesecrationBone("cranium", "gnawed"), /Preserved tier/);
  assert.throws(() => new DesecrationBone("cranium", "ancient"), /Preserved tier/);
});

test("Reveal Desecrated Modifier offers three same-side options and chooses the target match", () => {
  const hidden = new DesecrationBone("jawbone", "preserved")
    .apply(item([], [s1]), ctx(rngSequence([0]))).item;
  const target = { required_mods: [{ group: "target_group", min_tier: 1, gen_type: "prefix" as const, name: "Target" }], k_required: 1 };
  const options = [
    { ...p1, modId: "miss_one", group: "miss_one", tags: ["Life"] },
    { ...p2, modId: "target_mod", group: "target_group", tags: ["Ulaman"] },
    { ...p3, modId: "miss_two", group: "miss_two", tags: ["Mana"] },
  ];
  const result = new RevealDesecratedModifier()
    .apply(hidden, { ...ctxWithPool({ prefixes: options, suffixes: [] }, rngSequence([0, 0, 0])), target });

  assert.equal(result.applied, true);
  assert.ok(modIds(result.item).includes("desecrated_target_mod"));
  const selected = result.item.allMods().find(mod => mod.modId === "desecrated_target_mod");
  assert.equal(selected?.desecrated, true);
  assert.equal(selected?.hidden, false);
  assert.equal(selected?.abyssFamily, "Ulaman");
});

test("Normal crafting excludes exclusive Abyss-family mods while Desecration can reveal them", () => {
  const raw = (modId: string, tags: string[]): RawMod => ({
    modId,
    name: modId,
    affix: "prefix",
    modgroups: [modId],
    tags,
    tiers: [{ tier: 1, ilvl: 65, weight: 1, values: [] }],
  });
  const pools = build_craft_pools([
    raw("ordinary_one", []),
    raw("ordinary_two", []),
    raw("exclusive", ["Ulaman"]),
  ], 84);

  assert.deepEqual(pools.normal.prefixes.map(mod => mod.modId), ["ordinary_one", "ordinary_two"]);
  assert.deepEqual(pools.desecration.prefixes.map(mod => mod.modId), ["ordinary_one", "ordinary_two", "exclusive"]);

  const exalted = new ExaltedOrb().apply(item([], [s1]), ctxWithPool(pools.normal, rngSequence([0, 0])));
  assert.equal(exalted.applied, true);
  assert.ok(!modIds(exalted.item).includes("exclusive"));

  const hidden = new DesecrationBone("jawbone", "preserved")
    .apply(item([], [s1]), ctxWithPool(pools.normal, rngSequence([0]))).item;
  const target = {
    required_mods: [{ group: "exclusive", min_tier: 1, gen_type: "prefix" as const, name: "Exclusive" }],
    k_required: 1,
  };
  const revealed = new RevealDesecratedModifier().apply(
    hidden,
    { ...ctxWithPools(pools.normal, pools.desecration, rngSequence([0, 0, 0])), target },
  );

  assert.equal(revealed.applied, true);
  assert.ok(modIds(revealed.item).includes("desecrated_exclusive"));
});

test("Ancient Bone reveal only offers required-level 40+ modifiers", () => {
  const hidden = new DesecrationBone("jawbone", "ancient")
    .apply(item([], [s1]), ctx(rngSequence([0]))).item;
  const options = [
    { ...p1, modId: "low", group: "low", required_level: 39 },
    { ...p2, modId: "high_one", group: "high_one", required_level: 40 },
    { ...p3, modId: "high_two", group: "high_two", required_level: 50 },
    { ...p4, modId: "high_three", group: "high_three", required_level: 60 },
  ];
  const result = new RevealDesecratedModifier()
    .apply(hidden, ctxWithPool({ prefixes: options, suffixes: [] }, rngSequence([0, 0, 0])));

  assert.equal(result.applied, true);
  assert.ok(!modIds(result.item).includes("desecrated_low"));
});

test("Hidden Desecrated modifiers occupy slots and can be removed by ordinary crafting", () => {
  const hidden = new DesecrationBone("jawbone", "preserved")
    .apply(item([], [s1]), ctx(rngSequence([0]))).item;
  assert.equal(hidden.prefixes.length, 1);

  const annulled = new AnnulmentOrb().apply(hidden, ctx(rngSequence([0])));
  assert.equal(annulled.applied, true);
  assert.ok(!annulled.item.allMods().some(mod => mod.hidden));
});

test("Omen of Light restricts Annulment to Desecrated modifiers", () => {
  const desecrated = { ...p2, desecrated: true };
  const base = item([p1, desecrated], [s1]);
  const result = withModifiers(new AnnulmentOrb(), new OmenOfLight()).apply(base, ctx(rngSequence([0])));

  assert.equal(result.applied, true);
  assert.ok(!modIds(result.item).includes("p2"));
  assert.ok(modIds(result.item).includes("p1"));
  assert.deepEqual(result.cost, { annul: 1, omen_light: 1 });
});

test("Fracturing Orb cannot select a Desecrated modifier", () => {
  const desecrated = { ...p1, desecrated: true };
  const base = item([desecrated, p2], [s1, s2]);
  const result = new FracturingOrb().apply(base, ctx(rngSequence([0])));

  assert.equal(result.applied, true);
  assert.ok(!result.item.fracturedModIds.has("p1"));
  assert.ok(result.item.fracturedModIds.has("p2"));
});

test("Necromancy omens force Desecration prefix or suffix and cannot combine", () => {
  const base = item([p1], [s1]);
  const prefix = withModifiers(new DesecrationBone("rib", "preserved"), new OmenOfSinistralNecromancy())
    .apply(base, ctx(rngSequence([0])));
  const suffix = withModifiers(new DesecrationBone("rib", "preserved"), new OmenOfDextralNecromancy())
    .apply(base, ctx(rngSequence([0])));

  assert.equal(prefix.item.allMods().find(mod => mod.hidden)?.gen_type, "prefix");
  assert.equal(suffix.item.allMods().find(mod => mod.hidden)?.gen_type, "suffix");
  assert.throws(() => withModifiers(
    new DesecrationBone("rib", "preserved"),
    new OmenOfSinistralNecromancy(),
    new OmenOfDextralNecromancy(),
  ).apply(base, ctx()), /cannot be combined/);
});

test("Necromancy omen fails atomically when its side cannot be created", () => {
  const full = item([p1, p2, p3], [s1, s2, s3], [p1, p2, p3]);
  assertRejected(
    withModifiers(new DesecrationBone("rib", "preserved"), new OmenOfSinistralNecromancy())
      .apply(full, ctx(rngSequence([0]))),
    full,
  );
});

test("Abyssal Echoes lets reveal choose the best option across both sets", () => {
  const hidden = new DesecrationBone("jawbone", "preserved").apply(item([], [s1]), ctx(rngSequence([0]))).item;
  const target = { required_mods: [{ group: "target_group", min_tier: 1, gen_type: "prefix" as const, name: "Target" }], k_required: 1 };
  const options = [
    { ...p1, modId: "first_one", group: "first_one", weight: 1 },
    { ...p2, modId: "first_two", group: "first_two", weight: 1 },
    { ...p3, modId: "first_three", group: "first_three", weight: 1 },
    { ...p4, modId: "target", group: "target_group", weight: 1 },
    { ...p1, modId: "second_two", group: "second_two", weight: 1 },
    { ...p2, modId: "second_three", group: "second_three", weight: 1 },
  ];
  const result = withModifiers(new RevealDesecratedModifier(), new OmenOfAbyssalEchoes())
    .apply(hidden, { ...ctxWithPool({ prefixes: options, suffixes: [] }, rngSequence([0, 0, 0, 0.6, 0, 0])), target });

  assert.equal(result.applied, true);
  assert.ok(modIds(result.item).includes("desecrated_target"));
  assert.deepEqual(result.cost, { omen_abyssal_echoes: 1 });
});

test("Family Desecration omens guarantee their family for weapons and jewellery", () => {
  const families = [
    { omen: new OmenOfTheSovereign(), family: "Ulaman" },
    { omen: new OmenOfTheLiege(), family: "Amanamu" },
    { omen: new OmenOfTheBlackblooded(), family: "Kurgal" },
  ] as const;
  const familyPool = {
    prefixes: [
      { ...p1, modId: "ulaman", group: "ulaman", tags: ["Ulaman"] },
      { ...p2, modId: "amanamu", group: "amanamu", tags: ["Amanamu"] },
      { ...p3, modId: "kurgal", group: "kurgal", tags: ["Kurgal"] },
      { ...p4, modId: "ordinary", group: "ordinary", tags: [] },
    ],
    suffixes: [],
  };

  for (const { omen, family } of families) {
    const hidden = withModifiers(new DesecrationBone("jawbone", "preserved"), omen)
      .apply(item([], [s1]), ctx(rngSequence([0]))).item;
    const result = new RevealDesecratedModifier().apply(hidden, ctxWithPool(familyPool, rngSequence([0, 0, 0])));
    assert.equal(result.applied, true);
    assert.ok(result.events[0].details?.options instanceof Array);
    assert.ok((result.events[0].details?.options as string[]).some(id => id === `desecrated_${family.toLowerCase()}`));
  }

  assert.throws(
    () => withModifiers(new DesecrationBone("rib", "preserved"), new OmenOfTheSovereign())
      .apply(item([p1], [s1]), ctx()),
    /cannot apply/,
  );
});

test("Family Desecration reveal fails atomically when its family has no legal option", () => {
  const hidden = withModifiers(new DesecrationBone("collarbone", "preserved"), new OmenOfTheSovereign())
    .apply(item([], [s1]), ctx(rngSequence([0]))).item;
  const noFamily = { prefixes: [p1, p2, p3], suffixes: [] };
  assertRejected(new RevealDesecratedModifier().apply(hidden, ctxWithPool(noFamily, rngSequence([0]))), hidden);
});

test("Putrefaction fills three prefixes and suffixes, preserves fractures, and corrupts", () => {
  const base = item([p1, p2], [s1], [p1]);
  const result = withModifiers(new DesecrationBone("jawbone", "preserved"), new OmenOfPutrefaction())
    .apply(base, ctx());

  assert.equal(result.applied, true);
  assert.equal(result.item.prefixes.length, 3);
  assert.equal(result.item.suffixes.length, 3);
  assert.equal(result.item.allMods().filter(mod => mod.hidden).length, 5);
  assert.ok(result.item.fracturedModIds.has("p1"));
  assert.equal(result.item.corrupted, true);
  assert.deepEqual(result.cost, { preserved_jawbone: 1, omen_putrefaction: 1 });
});

test("Putrefaction-created hidden modifiers can be revealed after corruption", () => {
  const base = item([p1, p2], [s1], [p1]);
  const putrefied = withModifiers(new DesecrationBone("jawbone", "preserved"), new OmenOfPutrefaction())
    .apply(base, ctx()).item;
  const result = new RevealDesecratedModifier()
    .apply(putrefied, ctxWithPool({ prefixes: [p2, p3, p4], suffixes: [s1, s2, s3] }, rngSequence([0, 0, 0])));

  assert.equal(result.applied, true);
  assert.equal(result.item.corrupted, true);
  assert.equal(result.item.allMods().filter(mod => mod.hidden).length, 4);
});

test("Putrefaction cannot combine with other Desecration omens", () => {
  assert.throws(() => withModifiers(
    new DesecrationBone("jawbone", "preserved"),
    new OmenOfPutrefaction(),
    new OmenOfSinistralNecromancy(),
  ).apply(item([p1], [s1]), ctx()), /cannot be combined/);
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
  const normalItem = CraftedItem.emptyNormal();
  assertRejected(new AnnulmentOrb().apply(normalItem, ctx()), normalItem);

  const tooFew = item([p1], [s1]);
  assertRejected(new FracturingOrb().apply(tooFew, ctx()), tooFew);
});

test("Invalid Greater/Perfect Essence uses are rejected without cost", () => {
  const guaranteed = mod("guaranteed", "prefix", 1);
  const normal = CraftedItem.emptyNormal();
  const magicItem = magic([p1], [s1]);

  assertRejected(testEssence("greater_essence_test", guaranteed, "greater").apply(normal, ctx()), normal);
  const rare = item([p1], [s1]);
  assertRejected(testEssence("greater_essence_test", guaranteed, "greater").apply(rare, ctx()), rare);
  assertRejected(testEssence("perfect_essence_test", guaranteed, "perfect").apply(magicItem, ctx()), magicItem);
});

test("All modeled crafting ingredients reject corrupted items without cost", () => {
  const normal = corrupted(CraftedItem.emptyNormal());
  const magicItem = corrupted(magic([p1]));
  const rare = corrupted(item([p1, p2], [s1, s2]));
  const guaranteed = mod("guaranteed_corrupted_test", "prefix", 1);
  const hiddenDesecrated = corrupted(
    new DesecrationBone("jawbone", "preserved").apply(item([p1], [s1]), ctx(rngSequence([0]))).item,
  );

  const cases = [
    { ingredient: new TransmutationOrb(), item: normal },
    { ingredient: new GreaterTransmutationOrb(), item: normal },
    { ingredient: new PerfectTransmutationOrb(), item: normal },
    { ingredient: new AlchemyOrb(), item: normal },
    { ingredient: new AugmentationOrb(), item: magicItem },
    { ingredient: new GreaterAugmentationOrb(), item: magicItem },
    { ingredient: new PerfectAugmentationOrb(), item: magicItem },
    { ingredient: new RegalOrb(), item: magicItem },
    { ingredient: new GreaterRegalOrb(), item: magicItem },
    { ingredient: new PerfectRegalOrb(), item: magicItem },
    { ingredient: new ExaltedOrb(), item: rare },
    { ingredient: new GreaterExaltedOrb(), item: rare },
    { ingredient: new PerfectExaltedOrb(), item: rare },
    { ingredient: new ChaosOrb(), item: rare },
    { ingredient: new GreaterChaosOrb(), item: rare },
    { ingredient: new PerfectChaosOrb(), item: rare },
    { ingredient: new AnnulmentOrb(), item: rare },
    { ingredient: new FracturingOrb(), item: rare },
    { ingredient: new Alloy("alloy_corrupted_test", "Test Alloy", guaranteed), item: rare },
    { ingredient: CatalystCatalog.create("flesh_catalyst", "1")!, item: rare },
    { ingredient: new DesecrationBone("jawbone", "preserved"), item: rare },
    { ingredient: testEssence("greater_essence_corrupted_test", guaranteed, "greater"), item: magicItem },
    { ingredient: testEssence("perfect_essence_corrupted_test", guaranteed, "perfect"), item: rare },
  ];

  for (const entry of cases) {
    assertRejected(entry.ingredient.apply(entry.item, ctx()), entry.item);
  }
  assertRejected(new RevealDesecratedModifier().apply(hiddenDesecrated, ctx()), hiddenDesecrated);
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
