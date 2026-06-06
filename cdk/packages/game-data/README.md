# Code-Owned Game Data

This directory is the source of truth for equipment mod pools.

- `generated/modifiers.ts` defines shared modifier identity and metadata.
- `generated/equipment-types.ts` defines one class per equipment/base type. Each class explicitly owns its available mods, tiers, values, and weights.
- `generated/item-classes.ts` defines frontend/domain groupings such as Wand and Buckler.
- `catalog.ts` projects the definitions into frontend JSON and DynamoDB records.
- `validate.ts` enforces catalog invariants.

Commands:

```bash
npm run test:game-data
npm run project:game-data
npm run sync:game-data
```

`bootstrap:game-data` is only an import utility for rebuilding the TypeScript definitions from a reviewed legacy dataset. Normal changes should edit the TypeScript definitions, then run `project:game-data`. The deployment workflow synchronizes the committed catalog into DynamoDB after CDK deploy.
