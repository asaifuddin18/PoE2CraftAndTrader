# PoE2 Crafting Cost Algorithm — Implementation Spec

**Goal:** Given a desired end item (target mods, each with a minimum tier, plus a
"k of n mods required" rule), compute the cheapest crafting strategy and return
(a) the ordered list of steps and (b) the expected cost with a cost distribution.

**Scope note:** This spec only cares about rolling the correct *mods at the
correct tiers*. Do NOT model Divine Orbs or any value-rolling. A pattern
SUCCEEDS the moment the required mods at the required tiers are present. Numeric
roll-within-range is out of scope.

**Data source:** RePoE2 (`mods.json` / `mods_by_base.json`, `essences.json`,
`item_classes.json`, `base_items.json`) from https://repoe-fork.github.io/poe2/

---

## 0. High-level shape

```
Inputs:
  - target spec (mods + per-mod min tier + k-of-n rule)
  - base item class + ilvl
  - currency price table (currency_name -> price in a single unit, e.g. exalts)

Pipeline:
  1. Build mod pools for this (item_class, ilvl)         [Section 2]
  2. Enumerate candidate patterns                         [Section 4]
  3. Cost each pattern (analytic OR Monte Carlo)          [Section 5]
  4. Pick argmin expected cost                            [Section 6]
  5. Return {steps, mean, p50, p90, p99, currency_basket} [Section 7]
```

The whole thing is "enumerate patterns, cost each, return cheapest." Patterns are
parameterized policies. Omens are parameters on patterns, NOT separate patterns.

---

## 1. Core data model

```python
@dataclass(frozen=True)
class ModEntry:                 # one tier of one mod, from mods.json
    mod_id: str
    group: str                  # exclusivity group; one mod per group per item
    gen_type: str               # "prefix" | "suffix"
    tier: int                   # T1 = best (lowest number)
    required_level: int         # ilvl gate
    weight: int                 # spawn weight resolved for THIS item_class

@dataclass(frozen=True)
class TargetMod:
    group: str                  # which exclusivity group must be satisfied
    min_tier: int               # accept this tier OR better (tier <= min_tier)
    gen_type: str               # "prefix" | "suffix"

@dataclass
class TargetSpec:
    required_mods: list[TargetMod]
    k_required: int             # need at least k of the listed mods (k-of-n)
    # success = at least k_required of required_mods are satisfied simultaneously

@dataclass
class ItemState:
    rarity: str                 # "normal" | "magic" | "rare"
    prefixes: list[ModEntry]    # current prefixes (max 1 magic / 3 rare)
    suffixes: list[ModEntry]    # current suffixes (max 1 magic / 3 rare)
    fractured_mod_ids: set[str] # locked mods (immune to removal/reroll)
    corrupted: bool             # if True, no further normal crafting

    def n_mods(self):  return len(self.prefixes) + len(self.suffixes)
    def open_prefix(self): return len(self.prefixes) < (1 if self.rarity=="magic" else 3)
    def open_suffix(self): return len(self.suffixes) < (1 if self.rarity=="magic" else 3)
```

### Max slots by rarity
- normal: 0 / 0
- magic: 1 prefix / 1 suffix
- rare: 3 prefix / 3 suffix

---

## 2. Building the mod pool (do this ONCE per craft)

```
build_pools(item_class, ilvl):
    raw = load mods_by_base.json[item_class]      # all mods that can appear
    eligible = [m for m in raw
                if resolve_weight(m, item_class) > 0      # tag match, Section 2.1
                and m.required_level <= ilvl]             # ilvl gate (Section 7.2 of data doc)
    prefix_pool = [m for m in eligible if m.gen_type == "prefix"]
    suffix_pool = [m for m in eligible if m.gen_type == "suffix"]
    return prefix_pool, suffix_pool
```

### 2.1 Resolving spawn weight (first-matching-tag rule)
`spawn_weights` is an ORDERED list of `{tag, weight}`. Walk top-to-bottom; use the
weight of the FIRST tag that the item has. If none match, weight = 0 (cannot spawn).
The item_class's tags come from `item_classes.json` / `base_items.json`.

### 2.2 Weighted draw — the single most-used primitive

```
draw(pool, present_groups):
    # eligible = correct type already (pool is pre-split), minus blocked groups
    cand = [m for m in pool if m.group not in present_groups]
    W = sum(m.weight for m in cand)
    if W == 0: return None            # nothing can roll (fully blocked)
    r = uniform(0, W)
    walk cand subtracting weights until r crosses -> return that ModEntry
```

`present_groups` = set of groups already on the item. THIS is exclusivity-group
blocking (Section 7.4 of the data doc) and it is the #1 reason naive 1/p is wrong.

### 2.3 Per-group hit probability (used by analytic costing)
Probability a single draw from `pool` lands a mod in target group `g` at tier
`<= min_tier`, given `present_groups` already on the item:

```
p_hit(pool, g, min_tier, present_groups):
    cand = [m for m in pool if m.group not in present_groups]
    W = sum(m.weight for m in cand)
    if W == 0: return 0.0
    good = sum(m.weight for m in cand if m.group == g and m.tier <= min_tier)
    return good / W
```

Note `good` sums ALL tiers at-or-better-than min_tier in that group — pool
dilution (lower tiers still in pool) is handled automatically because they're in
the denominator but not the numerator.

---

## 3. Currency action primitives

Each is a pure function `ItemState -> ItemState` using RNG. These are the building
blocks patterns call. Implement EXACTLY per the data doc sections cited.

```
transmute(s):          # normal -> magic, add 1 mod (sometimes 2). Data §2.2
    pick slot type (if 2-mod outcome: one prefix + one suffix),
    draw() into it. rarity = magic.

augment(s):            # magic w/ 1 mod -> magic w/ 2. fills the OPEN slot type. §2.2
    draw() into whichever of prefix/suffix is open.

regal(s, omen=None):   # magic -> rare, keep mods, add 1. §2.2
    if omen == "sinistral": force prefix
    elif omen == "dextral": force suffix
    elif omen == "homogenising": force same tag-group-family as an existing mod
    else: if both open -> 50/50 slot pick, else open slot
    draw() into chosen slot. rarity = rare.

alchemy(s, omen=None): # normal -> rare with exactly 4 mods. §2.2
    if omen == "sinistral": maximize prefixes
    elif omen == "dextral": maximize suffixes
    else: 4 independent draws, each slot-type random (NOT fixed 2p2s)
    respect group blocking between draws (update present_groups each draw).

exalt(s, omen=None):   # rare with open slot, add 1. §2.3 / §8.5
    if omen == "sinistral": force prefix
    elif omen == "dextral": force suffix
    elif omen == "greater": add TWO mods (sequential draws)
    elif omen == "homogenising": same tag-group-family as existing
    else: if both open -> 50/50, else open slot
    draw().

chaos(s, omen=None):   # rare: remove 1, add 1 of SAME type. SINGLE replace, NOT reroll. §8.4
    if omen == "whittling": removed = lowest required_level non-fractured mod
    elif omen == "sinistral_erasure": removed picked from prefixes only
    elif omen == "dextral_erasure": removed picked from suffixes only
    else: removed = uniform over non-fractured mods (1/N)
    add a new mod of the SAME gen_type as removed, drawn excluding all present groups.

annul(s, omen=None):   # remove 1 random mod. §8.3
    pool = non-fractured mods
    if omen == "sinistral": pool = prefixes only
    elif omen == "dextral": pool = suffixes only
    elif omen == "greater": remove 2 (uniform, sequential, no replacement)
    remove uniform 1/len(pool).

fracture(s):           # lock 1 random mod permanently. requires rare, >=4 mods, uncorrupted. §6
    target = uniform over all explicit mods (1/N)
    add target.mod_id to fractured_mod_ids.

essence(s, ess, tier): # guarantee 1 mod. §4
    if tier in {lesser, normal, greater}:   # magic -> rare
        place guaranteed mod (from essences.json, by item_class) in its fixed slot type,
        fill remaining slots with random draws (respect blocking). rarity = rare.
    if tier == perfect:                      # rare -> rare
        remove 1 random non-fractured mod (1/N, or omen sinistral/dextral
        crystallisation restricts to pre/suf), then add guaranteed mod.

alloy(s, alloy_type):  # remove 1 random (1/N), add guaranteed alloy-exclusive mod. §3
    same removal math as perfect essence; guaranteed mod by (alloy_type, item_class).
```

**Hard rules to enforce in every primitive:**
- No Orb of Scouring exists. There is NO action that returns rare->normal. "Restart"
  = discard the item and start a fresh white base (re-pay base cost). (Data §1.1)
- Fractured mods are excluded from ALL removal pools (annul, chaos-remove,
  perfect-essence-remove, alloy-remove). (Data §6.5)
- Corrupted items accept no further crafting.
- Chaos is single-mod replace, never a full reroll. (Data §8.4)

---

## 4. The pattern catalog

Each pattern is a generator of a **policy**: a function
`run(rng, pools, target, prices) -> (success: bool, basket: dict[currency,int])`
that crafts one full attempt-sequence (including internal reroll loops and the
restart-threshold decision) and reports the currency consumed.

Patterns take **parameters** (omen choices, essence/alloy selection, restart
threshold, target-of-k subset). The optimizer sweeps these.

### Pattern list (id : description : when applicable)

```
A1  alt_regal            Transmute->Augment->(reroll)->Regal->Exalt-fill
                         applies: need <=2 specific anchor mods, rest fillable
A2  alt_regal_omen       A1 with Coronation omen on the Regal step
                         applies: the Regal-added 3rd mod's TYPE matters

B1  alch_chaos           Alchemy -> Chaos-fix unwanted mods one at a time
                         applies: "good enough" targets, no rare-specific tiers
B2  alch_omen            Alchemy with Sinistral/Dextral Alchemy omen (lopsided target)
B3  alch_whittling       Alchemy -> Chaos w/ Omen of Whittling (directed worst-mod upgrade)
                         applies: iterative tier improvement; usually dominates B1

C1  essence_fill         Essence (L/N/G) guarantee 1 mod -> random fill
                         applies: exactly one hard/rare mod, rest common
C2  essence_finish       C1 -> Exalt-fill / Chaos-fix remaining slots
C3  perfect_essence      Perfect Essence chain on existing rare (swap junk->guaranteed)
                         applies: finishing a near-done rare; optional crystallisation omens

D1  exalt_fill           Plain Exalt to fill open rare (completion sub-step, rarely standalone)
D2  exalt_omen           Omen-directed Exalt (sinistral/dextral/greater/homogenising)
                         applies: need a specific slot type filled, avoid 50/50 gamble

E1  fracture_anchor      Annul-down to 4 mods -> Fracture desired -> rebuild rest
                         applies: one extremely rare mod to "bank" before gambling rest
E2  fracture_then_fill   Fracture first, then run any B/C/D fill on remaining slots
                         (this is a WRAPPER: prepend fracture to another pattern)

G1  alloy_inject         Alloy to add an alloy-exclusive guaranteed mod
                         applies (often FORCED): target needs an alloy-only stat
```

### Forced inclusions (gate before enumeration)
- If any target mod is **essence-exclusive** -> the essence guaranteeing it MUST be
  in the pattern (C-family or essence sub-step).
- If any target mod is **alloy-exclusive** -> G1 is forced in.
- If a target mod cannot appear at the required tier at this ilvl (`required_level >
  ilvl` for all tiers `<= min_tier`) -> the craft is IMPOSSIBLE; return error early.

### Compositions to also enumerate (two-phase: anchor then finish)
Most real builds are `anchor-phase -> finish-phase`. Enumerate these combos:
```
{A1, A2, C1, C2, C3, E1, G1}  x  {D1, D2, B1, B3, C3}
```
plus each anchor pattern standalone. De-dup obviously-equivalent combos. Wrap any
of them in E2 (fracture-first) as an optional variant when one mod is rare.

---

## 5. Costing a pattern

Two engines. Pick per stage; a single pattern can mix both.

### 5.1 Analytic engine (use when stages are INDEPENDENT geometric loops)
A stage = "repeat action until success." If a pattern is a chain of such stages
whose success probabilities don't depend on each other's outcomes:

```
E[cost] = sum over stages ( cost_per_attempt[stage] / p_success[stage] )
```
- `p_success` comes from `p_hit()` (Section 2.3), the 50/50 slot pick, or 1/N.
- The full distribution of each stage is Geometric(p); the total is a sum of
  independent geometrics. Report mean = sum(1/p); for percentiles either convolve
  the geometrics numerically or fall back to MC (5.2) for the distribution.
- Use this for clean chains like A1's transmute/augment loop (data doc §8.1).

### 5.2 Monte Carlo engine (use when stages are COUPLED)
Independence breaks under: exclusivity-group blocking changing later denominators,
restart-vs-continue stopping decisions, fracture/annul ordering, omen effects that
depend on current mod composition, k-of-n with many satisfying orderings.

```
monte_carlo(policy, pools, target, prices, N=50_000):
    costs = []
    for _ in range(N):
        basket = policy.run(rng, pools, target, prices)   # one full sequence
        costs.append(price(basket, prices))
    return summarize(costs)   # mean, p50, p90, p99, std
```

**Decision rule for the implementer:** if the policy contains a reroll loop whose
per-iteration success probability changes based on what's currently on the item, OR
a restart/stop decision, cost it with MC. Otherwise use analytic. When unsure, MC.

**N guidance:** heavy-tailed. Use N=50k for ranking patterns; bump to 200k–500k for
the final chosen pattern's p99. Use a fixed seed for reproducibility; report std.

### 5.3 Restart threshold (the meta-parameter)
Every policy that can hit a dead end needs a restart rule. Model it as a parameter
the policy checks each loop, e.g.:
```
restart_if:
  - a target group got blocked by an unremovable mod (no open slot, can't annul it
    because removing it isn't allowed/too costly), OR
  - mod count exceeded what lets us still fit all targets, OR
  - sunk attempts on this base exceeded threshold T
on restart: basket += base_cost; reset state to fresh white base.
```
Sweep T (e.g. {1,2,3,5,8,12}) and pick the cost-minimizing value. Because Scouring
doesn't exist, restart always re-pays the white-base cost — include it.

### 5.4 Pricing a basket
```
price(basket, prices) = sum( count * prices[currency] for currency in basket )
```
All output in one unit (e.g. exalts). Base item cost is a currency line too.

---

## 6. Optimizer

```
solve(target, item_class, ilvl, prices):
    pools = build_pools(item_class, ilvl)
    assert_feasible(target, pools, ilvl)          # Section 4 forced/impossible checks

    candidates = enumerate_patterns(target, pools)  # Section 4, with forced inclusions
    results = []
    for pattern in candidates:
        for params in pattern.param_grid(target):   # omens, essence/alloy choice,
                                                     # restart T, k-of-n subset
            policy = pattern.instantiate(params)
            cost   = cost_pattern(policy, pools, target, prices)  # analytic or MC
            results.append((cost.mean, pattern, params, cost))
    best = argmin(results, key=mean)
    return build_output(best)
```

**param_grid** should stay small to avoid blowup: only sweep parameters that
plausibly matter for THIS target (e.g. don't sweep suffix omens if all targets are
prefixes). Coordinate-descent on restart-threshold instead of full grid if the grid
gets large.

---

## 7. Output format

```json
{
  "pattern": "C2 essence_finish (+ D2 dextral exalt)",
  "feasible": true,
  "expected_cost": { "mean": 142.5, "p50": 95, "p90": 310, "p99": 720, "unit": "exalt" },
  "currency_basket_mean": { "greater_essence_of_the_body": 1, "exalted_orb": 6.8, "white_base": 1.4 },
  "steps": [
    "Buy ilvl>=N white <base>",
    "Essence of the Body (Greater) -> rare, guarantees T2+ Life prefix",
    "Exalt with Omen of Dextral Exaltation -> force suffix (resist)",
    "... continue until k-of-n satisfied ...",
    "Restart from white base if >5 exalts sunk without progress"
  ],
  "notes": [
    "Life mod anchored by essence to remove it from RNG.",
    "Group-blocking handled: only one mod per exclusivity group counted toward target."
  ]
}
```

`steps` is a human-readable trace of the chosen policy (the modal/expected path,
not one random sample). Generate it from the policy definition + the parameters.

---

## 8. Implementation order (build in this sequence)

1. Data loader + `build_pools` + `resolve_weight` (Section 2). Unit-test on one base.
2. `draw` / `p_hit` primitives (Section 2.2–2.3). Test: weights sum, blocking works.
3. Currency primitives (Section 3). Test each against the data-doc rules.
4. Target matcher: `is_satisfied(state, target)` incl. k-of-n and tier floors.
5. Analytic coster (5.1) — validate against data-doc §8.1 worked example.
6. MC coster (5.2) — validate MC ≈ analytic on a pure-independent pattern (sanity).
7. Patterns A1, B3, C2 first (cover the common cases), then the rest.
8. Optimizer + output (Sections 6–7).
9. Add E/G/omen variants last.

## 9. Critical correctness checklist (the easy-to-get-wrong list)
- [ ] T1 is BEST; "min tier" means `tier <= min_tier`.
- [ ] Exclusivity group blocking updates the denominator on EVERY draw.
- [ ] Pool dilution: high ilvl does NOT guarantee T1; lower tiers stay in pool.
- [ ] Chaos = single remove+replace of SAME type, NOT a full reroll.
- [ ] No Scouring: restart = new white base, re-pay base cost.
- [ ] Fractured mods excluded from all removal pools; counts toward slot total.
- [ ] Fracture at exactly 4 mods for best 1/4 lock odds (annul down first).
- [ ] Exalt with both slots open = 50/50 type pick, THEN weighted draw.
- [ ] Annul = uniform 1/N over non-fractured mods.
- [ ] Alchemy = exactly 4 mods, prefix/suffix split is random (not 2p2s).
- [ ] Corrupted items: no further crafting.
- [ ] k-of-n: success = at least k targets satisfied at once; count one mod per group.
