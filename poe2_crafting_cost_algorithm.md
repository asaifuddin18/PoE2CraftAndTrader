# PoE2 Crafting Cost Algorithm

The backend currently exposes one solver strategy: **Adaptive Rare Refinement**.

The crafting ingredient classes are the source of truth for game rules. The
strategy never reimplements currency behavior. It decides which audited
ingredient to apply next.

## Why the Solver Is Stochastic

Crafting actions have multiple weighted outcomes. A Chaos Orb, for example,
removes one random eligible modifier and then adds one weighted random eligible
modifier. A deterministic shortest-path algorithm would incorrectly treat a
lucky outcome as selectable.

The solver therefore treats crafting as a bounded stochastic shortest-path
problem:

```text
expected(action, state) =
  action price
  + average optimistic remaining cost across sampled legal outcomes
```

The lowest-scoring legal action becomes the policy action for that canonical
item state. Decisions are cached and reused across Monte Carlo simulations.

## Current Strategy

`RareRefinementStrategy` starts from a normal base and can choose:

- restart with a new normal base and Orb of Alchemy;
- regular, Greater, or Perfect Exalted Orb;
- Greater or side-specific Exaltation omens;
- regular, Greater, or Perfect Chaos Orb;
- Whittling or side-specific Erasure omens;
- regular, Greater, or side-specific Orb of Annulment.

The policy is reevaluated after every stochastic outcome. It can decide to fill
an open slot, replace an affix, create a slot, or abandon the current item.

## Weight-Derived Heuristic

For each missing target modifier, the heuristic computes its optimistic weighted
draw probability from the legal affix pool:

```text
p(target) = eligible target weight / total eligible pool weight
optimistic cost = cheapest relevant currency price / p(target)
```

The heuristic ignores destructive outcomes and other complications, making it
optimistic. Sampled real ingredient outcomes supply the practical correction.

## Boundaries

- Search samples per action: bounded.
- Cached canonical states: bounded.
- Craft actions per Monte Carlo run: bounded.
- Worker and basket-display simulation counts are separately bounded so one
  strategy cannot exhaust a Lambda invocation.
- Aggregate does not rerun the winner because only one strategy currently exists.
- Runs that exhaust the action budget are marked `solver_failure` and receive a
  prohibitive cost, so incomplete trajectories cannot appear artificially cheap.
- The Step Functions pipeline currently emits exactly one strategy job.
- Monte Carlo verifies the adaptive policy and produces the cost distribution.

Future ingredient families should be added as legal actions or as new strategy
implementations, without restoring hardcoded pattern chains.
