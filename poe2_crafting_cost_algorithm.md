# PoE2 Budget-Constrained Craft Optimizer

The Craft page optimizes one supplied physical item under a hard currency
budget. The user assigns a weight from 1-100 to each desired prefix or suffix.
Better eligible tiers earn a larger fraction of that weight; a missing modifier
earns zero.

```text
item score = sum(preference weight * rolled tier quality)
```

The backend converts Divine budgets to Exalts using the DynamoDB price snapshot.
Every complete ingredient and omen basket is priced before it is accepted. The
item is never abandoned for another base, and the policy stops when no
affordable action improves expected score.

## Workflow

1. `craft-prepare` validates the complete starting item, resolves preferences,
   loads the mod pool and prices, and creates ten deterministic evaluation jobs.
2. `craft-search` runs bounded Monte Carlo tree search and writes the learned
   state-to-action policy to S3.
3. Step Functions fans out ten `craft-worker` Lambdas. Each evaluates 500
   outcomes against the same learned policy and writes a partial histogram to S3.
4. `craft-aggregate` combines exactly 5,000 outcomes into marginal tier counts,
   desired-mod counts, a compact joint tier histogram, representative final
   items, spend/score summaries, and frequently visited policy decisions.

The audited crafting ingredient classes remain the source of truth for game
rules. Contextual action generation includes every currently modeled legal
ingredient family and omen combination, while replacement-base opening actions
are excluded.

## Operational Boundaries

- Search iterations and maximum actions per trajectory are bounded.
- Evaluation shards are deterministic for a fixed request and seed.
- S3 carries scratch data, learned policy, and partial histograms so Step
  Functions state payloads stay below 256 KB.
- CloudWatch metrics track search duration, evaluation count, policy fallbacks,
  rejected crafts, and any attempted budget overspend.
