import assert from "node:assert/strict";
import { CraftedItem } from "./domain/CraftedItem";
import type { CraftContext } from "./domain/CraftContext";
import {
  AlchemyOrb,
  AnnulmentOrb,
  AugmentationOrb,
  ChaosOrb,
  Essence,
  ExaltedOrb,
  FracturingOrb,
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
import type { ItemState, ModEntry, ModPool } from "./types";

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

function removedEventId(result: { events: { details?: Record<string, unknown> }[] }): string | null {
  return (result.events[0]?.details?.removed as string | null | undefined) ?? null;
}

test("Transmutation Orb makes a magic item and adds one random affix", () => {
  const result = new TransmutationOrb().apply(CraftedItem.emptyRare(), ctx(rngSequence([0])));
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
  const result = new AlchemyOrb().apply(CraftedItem.emptyRare(), ctx(seededRng(4)));
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
  const result = new Essence("greater_essence_test", guaranteed, "greater")
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
  const result = new Essence("greater_essence_test", guaranteed, "greater")
    .apply(item([p1, p2, p3], [s1]), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.prefixes.length, 3);
  assert.ok(state.prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(state.suffixes.some(m => m.modId === "s1"));
  assert.equal(countMods(result.item), 4);
});

test("Perfect Essence replaces one removable affix and supports crystallisation omens", () => {
  const guaranteedPrefix = mod("guaranteed_prefix", "prefix", 1);
  const base = item([p1], [s1]);

  const sin = withModifiers(
    new Essence("perfect_essence_test", guaranteedPrefix, "perfect"),
    new OmenOfSinistralCrystallisation(),
  ).apply(base, ctx(rngSequence([0])));
  assert.ok(!sin.item.toState().prefixes.some(m => m.modId === "p1"));
  assert.ok(sin.item.toState().prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(sin.item.toState().suffixes.some(m => m.modId === "s1"));

  const guaranteedSuffix = mod("guaranteed_suffix", "suffix", 1);
  const dex = withModifiers(
    new Essence("perfect_essence_test", guaranteedSuffix, "perfect"),
    new OmenOfDextralCrystallisation(),
  ).apply(base, ctx(rngSequence([0])));
  assert.ok(dex.item.toState().prefixes.some(m => m.modId === "p1"));
  assert.ok(!dex.item.toState().suffixes.some(m => m.modId === "s1"));
  assert.ok(dex.item.toState().suffixes.some(m => m.modId === "guaranteed_suffix"));
});

test("Perfect Essence removes a same-side affix when the guaranteed side is full", () => {
  const guaranteed = mod("guaranteed_prefix", "prefix", 1);
  const result = new Essence("perfect_essence_test", guaranteed, "perfect")
    .apply(item([p1, p2, p3], [s1]), ctx(rngSequence([0])));
  const state = result.item.toState();
  assert.equal(state.prefixes.length, 3);
  assert.ok(state.prefixes.some(m => m.modId === "guaranteed_prefix"));
  assert.ok(state.suffixes.some(m => m.modId === "s1"));
});

test("Omens reject incompatible ingredients", () => {
  assert.throws(
    () => withModifiers(new TransmutationOrb(), new OmenOfWhittling()).apply(CraftedItem.emptyRare(), ctx()),
    /cannot apply/,
  );
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
