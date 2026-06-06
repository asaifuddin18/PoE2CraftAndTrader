import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = resolve(root, "data/raw/craftofexile/poec_data.json");
const outputPath = resolve(root, "cdk/packages/functions/shared/data/essences.json");
const source = JSON.parse(
  readFileSync(sourcePath, "utf8").replace(/^\s*\w+\s*=\s*/, "").replace(/;\s*$/, ""),
);

const modifiers = new Map(source.modifiers.seq.map(mod => [mod.id_modifier, mod]));
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const catalog = Object.fromEntries(
  source.essences.seq
    .filter(essence => /^(Greater|Perfect) Essence /.test(essence.name_essence))
    .map(essence => {
      const tier = essence.name_essence.startsWith("Greater") ? "greater" : "perfect";
      const byBaseId = Object.fromEntries(
        Object.entries(JSON.parse(essence.tiers)).map(([baseId, choices]) => {
          const mods = choices.flat().map(choice => {
            const modifier = modifiers.get(choice.mod);
            if (!modifier || !["prefix", "suffix"].includes(modifier.affix)) {
              throw new Error(`Missing affix metadata for ${essence.name_essence}: ${choice.mod}`);
            }
            const groups = JSON.parse(modifier.modgroups || "[]");
            return {
              modId: choice.id,
              group: groups[0] ?? choice.id,
              gen_type: modifier.affix,
              tier: Number(choice.id.match(/(\d+)$/)?.[1] ?? 1),
              required_level: Number(choice.ilvl),
              weight: 1,
              name: modifier.name_modifier,
            };
          });
          return [baseId, mods];
        }),
      );
      const id = slug(essence.name_essence);
      return [id, { id, name: essence.name_essence, tier, byBaseId }];
    }),
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${Object.keys(catalog).length} end-game essences to ${outputPath}`);
