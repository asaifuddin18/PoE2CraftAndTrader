import assert from "node:assert/strict";
import { countMatchingJointOutcomes, eligibleTiers, formatCurrency, matchesJoint, matchesOutcomeMods } from "./craft-results";

const mods = [{
  modId: "life",
  tiers: [
    { tier: 1, ilvl: 80, weight: 100 },
    { tier: 2, ilvl: 60, weight: 200 },
    { tier: 3, ilvl: 20, weight: 0 },
  ],
}];

assert.deepEqual(eligibleTiers(mods, "life", 70), [2]);
assert.equal(matchesJoint("0.2", [{ modId: "life" }, { modId: "res" }], { life: 2 }), true);
assert.equal(matchesJoint("0.3", [{ modId: "life" }], { life: 2 }), false);
assert.equal(matchesJoint("", [{ modId: "life" }], { life: 2 }), false);
assert.equal(matchesJoint(
  "7.1",
  Array.from({ length: 8 }, (_, index) => ({ modId: `choice_${index}` })),
  { choice_7: 1 },
), true);
assert.equal(countMatchingJointOutcomes("0.2=a;0.3=5;=2", [{ modId: "life" }], { life: 2 }), 10);
assert.equal(matchesOutcomeMods([{ modId: "life", tier: 2 }], { life: 2 }), true);
assert.equal(matchesOutcomeMods([{ modId: "life", tier: 3 }], { life: 2 }), false);
assert.equal(matchesOutcomeMods([], { life: 2 }), false);
assert.equal(formatCurrency(45, 90), "45.0 ex");
assert.equal(formatCurrency(180, 90), "2.00 div");

console.log("Craft result UI tests passed");
