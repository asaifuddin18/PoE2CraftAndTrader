import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildIdealItemData } from "../packages/game-data/catalog";
import { validateGameData } from "../packages/game-data/validate";

const errors = validateGameData();
if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join("\n")}`);

const output = resolve(__dirname, "../../web/public/ideal-item-data.json");
writeFileSync(output, `${JSON.stringify(buildIdealItemData())}\n`);
console.log(`Wrote ${output}`);
