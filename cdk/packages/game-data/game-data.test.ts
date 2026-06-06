import assert from "node:assert/strict";
import { buildDynamoModItems, buildIdealItemData, EQUIPMENT_TYPES, ITEM_CLASSES, MODIFIERS } from "./catalog";
import { validateGameData } from "./validate";

assert.deepEqual(validateGameData(), []);
assert.equal(Object.keys(MODIFIERS).length, 353);
assert.equal(EQUIPMENT_TYPES.length, 61);
assert.equal(ITEM_CLASSES.length, 52);
assert.equal(buildDynamoModItems().length, 2179);

const projected = buildIdealItemData();
assert.equal(Object.keys(projected.mods).length, 61);
assert.equal(projected.classes.find(itemClass => itemClass.id === "armour.buckler")?.label, "Buckler");

const gloves = EQUIPMENT_TYPES.find(type => type.id === "33")!;
const boots = EQUIPMENT_TYPES.find(type => type.id === "39")!;
const movementSpeedId = boots.mods.find(entry => /Movement Speed/i.test(entry.modifier.name))?.modifier.id;
assert.ok(movementSpeedId, "Expected boots to have a movement-speed modifier");
assert.equal(gloves.mods.some(entry => entry.modifier.id === movementSpeedId), false);

const quarterstaff = EQUIPMENT_TYPES.find(type => type.id === "25")!;
const bow = EQUIPMENT_TYPES.find(type => type.id === "20")!;
assert.equal(quarterstaff.label, "Quarterstaff");
assert.ok(quarterstaff.mods.length > 0);
assert.ok(quarterstaff.buildModPool(84).every(mod => mod.required_level <= 84 && mod.weight > 0));
assert.notEqual(quarterstaff.getTotalWeight("5092", 84), bow.getTotalWeight("5092", 84));

console.log("Game-data catalog tests passed");
