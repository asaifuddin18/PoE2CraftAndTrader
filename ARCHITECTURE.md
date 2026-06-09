# PoE2 Craft & Trade — Architecture & Requirements

> Version 1.6 · P0 Release Scope · June 3, 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [P0 Requirements](#2-p0-requirements)
   - 2.1 Authentication
   - 2.2 Trade Search
   - 2.3 Ideal Roll Definition
   - 2.4 Crafting Path Solver
   - 2.5 Crafting Step Recommendation
   - 2.6 Item Comparison
   - 2.7 Crafting Session Log
   - 2.8 Listing Manager & Pricing Recommendations
   - 2.9 Divine Orb & Orb of Chance Simulators
3. [Design System](#3-design-system)
4. [System Architecture](#4-system-architecture)
5. [Core Data Models](#5-core-data-models)
6. [Crafting Engine — Detail](#6-crafting-engine--detail)
7. [Key Technical Decisions](#7-key-technical-decisions)
8. [Recommended Build Order](#8-recommended-build-order)
9. [Page Inventory & Layouts](#9-page-inventory--layouts)
10. [P1 Backlog](#10-p1-backlog)
11. [Open Questions](#11-open-questions)

---

## 1. Product Overview

PoE2 Craft & Trade is a web application that helps Path of Exile 2 players make smarter crafting and trading decisions. It combines trade search with crafting probability analysis, allowing players to compare the cost of buying an item outright versus crafting it themselves, and providing step-by-step crafting recommendations.

> **Core Value Proposition:** A player finds a listing for a near-ideal item. With one click they can see:
> - What crafting steps could get them from their current gear to the ideal rolls
> - The expected currency cost for each crafting path
> - The probability of success per attempt
> - How that cost compares to simply buying a better listed item

- **Target Users:** Active Path of Exile 2 players in the current league (Standard/seasonal)
- **Out of Scope (P0):** Hardcore, Solo Self-Found, PoE1, alerts/notifications, AI assistant

---

## 2. P0 Requirements

### 2.1 Authentication

Users must authenticate before saving any data. Authentication is handled entirely via Google OAuth 2.0. No email/password flow is required.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-AUTH-01 | Google OAuth 2.0 sign-in | P0 |
| REQ-AUTH-02 | JWT session tokens, stored in httpOnly cookie | P0 |
| REQ-AUTH-03 | Session expiry and silent refresh | P0 |
| REQ-AUTH-04 | User profile (display name, avatar from Google) | P0 |

### 2.2 Trade Search

Users can build and save trade queries based on item type, mods, and mod values. Queries are executed against the GGG trade API and results are displayed in a familiar listing format.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-TRADE-01 | Build a trade query: item type, item base, ilvl range | P0 |
| REQ-TRADE-02 | Add mod filters with min/max roll values | P0 |
| REQ-TRADE-03 | Save named query patterns to user account | P0 |
| REQ-TRADE-04 | Load and re-execute a saved query pattern | P0 |
| REQ-TRADE-05 | Display results: item name, mods, seller, price in chaos/divine | P0 |
| REQ-TRADE-06 | Respect GGG API rate limits via backend proxy | P0 |
| REQ-TRADE-07 | Cache results for 60 seconds to avoid duplicate requests | P0 |

### 2.3 Ideal Roll Definition

Users can define an 'ideal item' — a target they are trying to craft or buy towards.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-IDEAL-01 | Create an ideal item: select base type, ilvl, and up to 6 mods | P0 |
| REQ-IDEAL-02 | For each mod, specify target roll value (exact or minimum) | P0 |
| REQ-IDEAL-03 | Save ideal items to user account with a name/label | P0 |
| REQ-IDEAL-04 | Link a saved ideal item to a saved trade query | P0 |
| REQ-IDEAL-05 | Edit and delete saved ideal items | P0 |

### 2.4 Crafting Path Solver

The core analytical feature. Given the user's exact starting item, a hard budget, and weighted prefix/suffix preferences, the optimizer learns an adaptive crafting policy and evaluates the quality distribution of items that policy can produce.

> **Optimizer Model:** The problem is modelled as a budget-constrained stochastic search:
> - Nodes = complete item states plus remaining budget
> - Edges = valid crafting ingredient actions with costs and stochastic transitions
> - Reward = weighted tier quality of preferred modifiers
> - Constraint = never exceed the supplied budget or replace the supplied item
>
> A bounded MCTS/UCB search builds a state-dependent policy. Ten deterministic evaluation workers then run 500 outcomes each and aggregate the result distribution.

#### User Inputs

| Input | Detail | Required |
|---|---|---|
| Starting item state | Blank base (item class + ilvl) OR existing item with current mods specified | Yes |
| Preferred prefixes | Ordered weighted modifier preferences | No |
| Preferred suffixes | Ordered weighted modifier preferences | No |
| Budget cap | Maximum spend in Exalted Orbs or Divine Orbs equivalent | Yes |

The preference lists are not limited to the item's six affix slots. Extra
preferences give the optimizer alternate valuable outcomes when all desired
modifiers cannot coexist on one item.

#### Currency Pool

| Currency Type | Effect on Item State | Solver Consideration |
|---|---|---|
| Chaos Orb | Removes one random affix, then adds one random eligible affix | High-variance refinement action |
| Exalted Orb | Adds one random mod to an item with open affixes | Low cost per action; good for filling open slots |
| Orb of Annulment | Removes one random mod | Probabilistic; solver models chance of removing right vs wrong mod |
| Regal Orb | Upgrades a magic item to rare, adding one mod | Used in magic-to-rare transition paths |
| Fracturing Orb | Permanently locks one random existing modifier — survives all further crafting | Applied when one mod is already ideal |
| Alloys (13 types) | Removes one random existing affix, applies a guaranteed crafted modifier unique to that alloy type | Each alloy targets a specific mod category |
| Essences | Guarantee one specific mod, reroll the rest | Powerful when one target mod is high-weight |
| Omens | Modify the outcome of the next currency use | Modelled as edge weight multiplier on the following action |
| Orb of Augmentation | Adds a mod to a magic item with only one mod | Part of Aug/Regal magic crafting paths |

#### Optimizer Output

| Output Field | Detail |
|---|---|
| Expected quality | Mean weighted tier-quality score across 5,000 outcomes |
| Expected spend | Mean Exalted-equivalent spend, always within budget |
| Per-mod tier probabilities | Marginal probability of each preferred modifier and tier |
| Desired-mod-count distribution | Distribution of how many preferred modifiers appear |
| Joint outcome histogram | Compact exact outcome buckets for client-side filtering |
| Representative final items | Common high-quality final states |
| Adaptive policy guidance | Common state-dependent actions learned by search |

#### Requirements

| Requirement | Detail | Priority |
|---|---|---|
| REQ-CRAFT-01 | Accept starting state: blank base (class + ilvl) or existing item with mods | P0 |
| REQ-CRAFT-02 | Accept weighted prefix and suffix preferences | P0 |
| REQ-CRAFT-03 | Accept a hard budget in Exalted or Divine Orb equivalent | P0 |
| REQ-CRAFT-04 | Load full PoE2 currency action rules and mod weight data from DynamoDB | P0 |
| REQ-CRAFT-05 | Build an adaptive hard-budget policy using existing ingredient implementations | P0 |
| REQ-CRAFT-06 | Evaluate exactly 5,000 deterministic policy outcomes | P0 |
| REQ-CRAFT-07 | Return quality, spend, tier, desired-count, joint-outcome, representative-item, and policy summaries | P0 |
| REQ-CRAFT-08 | No simulated outcome may exceed the user's budget | P0 |
| REQ-CRAFT-09 | Currency prices sourced from poe2.ninja, refreshed every 10 minutes | P0 |
| REQ-CRAFT-10 | User can override individual currency prices before running the solver | P0 |
| REQ-CRAFT-11 | Evaluation seeds are deterministic for the same prepared request | P0 |
| REQ-CRAFT-12 | Solver runs asynchronously and exposes status polling | P0 |

### 2.5 Crafting Step Recommendation

When a user clicks on a trade listing, the solver runs automatically using the listed item as the starting state and the linked ideal item as the target.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-REC-01 | On listing click, extract current mods from the listed item as starting state | P0 |
| REQ-REC-02 | Run solver against the linked ideal item target automatically | P0 |
| REQ-REC-03 | Display the top-ranked path as an ordered step sequence in a side panel | P0 |
| REQ-REC-04 | Show expected cost and success probability for the recommended path | P0 |
| REQ-REC-05 | Show 'Path 2' and 'Path 3' as collapsed alternatives the user can expand | P0 |
| REQ-REC-06 | If no path is found within budget cap, show a clear message with the cheapest path regardless | P0 |

### 2.6 Item Comparison — Listed vs Ideal

| Requirement | Detail | Priority |
|---|---|---|
| REQ-CMP-01 | Side-by-side panel: listed item on the left, ideal item on the right | P0 |
| REQ-CMP-02 | Colour-coded mod diff: green = met, amber = sub-tier, red = missing | P0 |
| REQ-CMP-03 | Show roll value delta for sub-tier mods (e.g. +42 life vs target +80) | P0 |
| REQ-CMP-04 | Summary score: '3/6 mods satisfied' displayed prominently | P0 |
| REQ-CMP-05 | Comparison panel links directly into the crafting step recommendation | P0 |

### 2.7 Crafting Session Log

Users can manually log crafting sessions to track currency spent and items produced.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-LOG-01 | Create a crafting session: name, target item, start date | P0 |
| REQ-LOG-02 | Add currency entries to a session: currency type, quantity, note | P0 |
| REQ-LOG-03 | Mark a session as complete: record final item and outcome (kept / sold / scrapped) | P0 |
| REQ-LOG-04 | If sold: record sale price in chaos equivalent | P0 |
| REQ-LOG-05 | Session summary: total spent, sale price, profit/loss in chaos | P0 |
| REQ-LOG-06 | View all sessions in a history list, sortable by date and profit/loss | P0 |
| REQ-LOG-07 | Delete or edit a session | P0 |

### 2.8 Listing Manager & Pricing Recommendations

Users connect their PoE account via GGG OAuth to view their active listings.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-LIST-01 | Connect PoE account via GGG OAuth (account:characters + stash scopes) | P0 |
| REQ-LIST-02 | Display all active listings for the current league | P0 |
| REQ-LIST-03 | For each listing, fetch comparable items from the trade API to establish market price | P0 |
| REQ-LIST-04 | Show price recommendation: Raise / Lower / Competitive with % variance from market | P0 |
| REQ-LIST-05 | Colour indicator: green = competitive, amber = slightly off, red = significantly off | P0 |
| REQ-LIST-06 | User can dismiss a recommendation for a listing | P0 |
| REQ-LIST-07 | Recommendations refresh on page load; manual refresh button available | P0 |

### 2.9 Divine Orb & Orb of Chance Simulators

#### Divine Orb Simulator

Simulates rerolling existing mod values. Divine Orb cannot change mod tiers — only the numeric value within the tier's min/max range.

| Requirement | Detail | Priority |
|---|---|---|
| REQ-DIV-01 | User inputs current item mods with their tier ranges (min/max roll values) | P0 |
| REQ-DIV-02 | User specifies target roll value per mod | P0 |
| REQ-DIV-03 | Display probability of all target rolls being met in one Divine use | P0 |
| REQ-DIV-04 | Display expected number of Divines to hit all targets | P0 |
| REQ-DIV-05 | Display expected cost in chaos equivalent using poe2.ninja price | P0 |
| REQ-DIV-06 | Show probability distribution chart — x = number of Divines, y = cumulative probability | P0 |

#### Orb of Chance Simulator

| Requirement | Detail | Priority |
|---|---|---|
| REQ-CHC-01 | User selects a base item type | P0 |
| REQ-CHC-02 | Display the unique item(s) that can be obtained from that base | P0 |
| REQ-CHC-03 | Display probability of hitting the unique per attempt | P0 |
| REQ-CHC-04 | Display expected Orbs of Chance to hit the unique | P0 |
| REQ-CHC-05 | Display expected cost in chaos equivalent vs current trade price for that unique | P0 |
| REQ-CHC-06 | Show clear buy vs chance comparison: 'Expected cost to chance: X div \| Buy on trade: Y div' | P0 |

---

## 3. Design System

### 3.1 Visual Direction

Clean & modern — tool-first. Dark mode as the primary and only theme. The aesthetic prioritises data legibility over decoration. No gradients, no textures, no PoE gothic elements.

**Design Principles:**
- Data first: every pixel either communicates information or creates breathing room
- Dark but not gloomy: dark backgrounds with high-contrast text
- Colour is meaningful: green/amber/red are reserved for status signals — not decoration
- Minimal chrome: no heavy borders, no card shadows stacked on shadows
- Density with comfort: tables and lists are compact but not cramped

### 3.2 Colour Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0E0F13` | Page background |
| `--bg-surface` | `#16181F` | Cards, panels, sidebars |
| `--bg-elevated` | `#1E2029` | Dropdowns, modals, hover states |
| `--border` | `#2A2D3A` | All borders and dividers |
| `--text-primary` | `#E8E9EE` | Body text, headings |
| `--text-secondary` | `#8B8FA8` | Labels, captions, placeholders |
| `--text-disabled` | `#4A4D5E` | Disabled states |
| `--accent` | `#7B68EE` | Primary actions, active states, links |
| `--accent-hover` | `#9B8FFF` | Hover state for accent elements |
| `--status-positive` | `#4ADE80` | Met mods, profit, competitive price |
| `--status-warning` | `#FBBF24` | Sub-tier mods, slightly off price |
| `--status-negative` | `#F87171` | Missing mods, loss, overpriced |
| `--status-info` | `#60A5FA` | Neutral information, tooltips |

### 3.3 Typography

| Role | Font | Size / Weight |
|---|---|---|
| Display | Inter | 24px / 600 |
| Heading | Inter | 18px / 600 |
| Body | Inter | 15px / 400 |
| Data | Inter | 14px / 400 |
| Mono | JetBrains Mono | 13px / 400 |

---

## 4. System Architecture

### 4.1 High-Level Overview

Vercel-hosted Next.js frontend + AWS backend. All GGG API calls are proxied through the backend to protect rate limits and enable server-side caching.

> **Architecture Principles:**
> - The frontend never calls GGG or poe2.ninja directly
> - All external API access is mediated by AWS Lambda functions
> - All AWS infrastructure is defined and deployed exclusively via AWS CDK (TypeScript)
> - No resources are created manually in the AWS console
> - No VPC required — all services (Lambda, DynamoDB, S3) are public AWS endpoints

### 4.2 Frontend — Vercel / Next.js

| Component | Responsibility |
|---|---|
| Next.js App Router | Page routing, SSR for initial listing loads |
| NextAuth.js | Google OAuth flow, JWT session management |
| Trade Query Builder | UI for constructing and saving trade filters |
| Results Feed | Renders GGG API listing results with deal scoring |
| Ideal Item Editor | UI for defining target mod combinations |
| Crafting Optimizer | Starting-item editor, weighted preferences, outcome distributions, and adaptive policy guidance |
| Tailwind CSS | Styling — dark tool-first UI |
| Recharts | Probability distribution charts |

### 4.3 Backend — AWS

| Service | Role |
|---|---|
| API Gateway | Single entry point for all frontend → backend requests |
| Lambda: trade-proxy | Forwards trade searches to GGG API, enforces rate limits, caches results in DynamoDB (60s TTL) |
| Step Functions crafting optimizer | Prepares requests, builds policies, evaluates 5,000 outcomes, and aggregates results |
| Lambda: price-sync | Fetches poe2.ninja currency prices on a 10-minute EventBridge schedule |
| Mod data | Code-owned equipment/mod catalog projected into DynamoDB after deploy |
| DynamoDB | All storage: user accounts, saved queries, ideal items, mod data, GGG response cache (TTL), price cache (TTL) |

### 4.4 Infrastructure as Code — AWS CDK

All AWS resources are provisioned and managed using AWS CDK (TypeScript). No resources are created or modified manually.

**CDK Stacks:**

| Stack | Resources | Notes |
|---|---|---|
| StorageStack | DynamoDB table only | Single-table design |
| ApiStack | API Gateway + all Lambda functions, IAM roles | Least-privilege access |
| SchedulerStack | EventBridge rule for price-sync (10 min) | Depends on ApiStack Lambda ARNs |

**Conventions:**
- Language: TypeScript
- Environments: dev and prod via CDK context (`cdk deploy --context env=prod`)
- Lambda bundled via esbuild (`NodejsFunction` construct)
- All secrets stored in AWS Secrets Manager (Google OAuth credentials, GGG POESESSID)
- CDK bootstrap required once per account/region

**Directory Structure:**
```
cdk/
  bin/app.ts                    # CDK app entry point
  stacks/storage-stack.ts       # DynamoDB table
  stacks/api-stack.ts           # API Gateway + Lambdas
  stacks/scheduler-stack.ts     # EventBridge schedules
packages/
  functions/
    trade-proxy/                # Lambda: GGG API proxy
    craft-entry/                # Lambda: validate/start optimizer
    craft-prepare/              # Lambda: resolve request and evaluation jobs
    craft-search/               # Lambda: build adaptive policy
    craft-worker/               # Lambda: evaluate one deterministic shard
    craft-aggregate/            # Lambda: aggregate compact distributions
    price-sync/                 # Lambda: poe2.ninja price fetcher
```

### 4.5 External Dependencies & GGG API

> ⚠️ **Important:** The trade search endpoints (`/api/trade2/search`, `/api/trade2/fetch`) are **undocumented**. They are reverse-engineered from the official trade website. GGG's ToS (section 7i) technically prohibits reverse-engineering undocumented endpoints. GGG tolerates community trade tools in practice but access can be revoked without notice.

**Officially Documented PoE2 Endpoints:**

| Endpoint | Used For | Auth |
|---|---|---|
| `GET /league?realm=poe2` | Fetch current active league name | None (public) |
| `GET /character/poe2/<name>` | Read account characters (P1: build import) | OAuth — account:characters |
| `GET /currency-exchange/poe2` | Historical currency exchange digests | OAuth — service:cxapi |

**Undocumented Trade Endpoints (community-used):**

| Endpoint | Used For | Auth |
|---|---|---|
| `POST /api/trade2/search/<league>` | Submit trade query — returns item hash IDs | POESESSID cookie |
| `GET /api/trade2/fetch/<ids>` | Fetch full item details for up to 10 IDs | POESESSID cookie |

**Authentication Strategy:** One GGG service account POESESSID stored in AWS Secrets Manager. All user trade searches proxied through this single session. Rate limits apply per Lambda outbound IP.

**Other Dependencies:**

| Dependency | Used For | Notes |
|---|---|---|
| poe2.ninja | Live currency prices | Fetch every 10 min, stored in DynamoDB with TTL |
| RePoE2 (GitHub) | Datamined mod weights by item class + ilvl | Reviewed and imported into the code-owned game-data catalog |
| Google OAuth | User sign-in | Standard OAuth 2.0 via NextAuth.js |

### 4.6 Data Flow — Trade Search

| Step | Actor | Detail |
|---|---|---|
| 1 | User | Selects a saved query pattern and clicks Search |
| 2 | Frontend | POST /api/trade/search with query payload |
| 3 | Lambda: trade-proxy | Check DynamoDB for cached result (60s TTL item) |
| 4a (cache hit) | Lambda | Return cached listing array to frontend |
| 4b (cache miss) | Lambda | Forward query to GGG API, write result to DynamoDB with 60s TTL, return to frontend |
| 5 | Frontend | Render listings; if ideal item linked, score each listing |

### 4.7 Data Flow — Crafting Optimization

| Step | Actor | Detail |
|---|---|---|
| 1 | User | Supplies starting item, budget, and weighted preferences |
| 2 | Frontend | POST `/solve`; then poll `/status` using the returned execution ARN |
| 3 | Prepare Lambda | Validate input; load mod weights and currency prices from DynamoDB; create 10 evaluation jobs |
| 4 | Search Lambda | Run bounded MCTS/UCB search and store the adaptive policy in S3 |
| 5 | Step Functions Inline Map | Run 10 evaluation workers with 500 deterministic outcomes each |
| 6 | Aggregate Lambda | Combine exactly 5,000 outcomes into compact histograms and summaries |
| 7 | Frontend | Render expected quality/spend, probabilities, representative items, and policy guidance |

---

## 5. Core Data Models

### User
| Field | Type | Notes |
|---|---|---|
| userId | String (UUID) | Primary key |
| googleId | String | From Google OAuth sub claim |
| email | String | From Google profile |
| displayName | String | From Google profile |
| avatarUrl | String | From Google profile picture |
| createdAt | ISO Timestamp | |

### SavedQuery
| Field | Type | Notes |
|---|---|---|
| queryId | String (UUID) | Primary key |
| userId | String | Foreign key → User |
| name | String | User-defined label |
| itemClass | String | e.g. 'Wand', 'Body Armour' |
| itemBase | String \| null | Specific base type, optional |
| ilvlMin | Number \| null | |
| modFilters | Array\<ModFilter\> | |
| linkedIdealId | String \| null | Foreign key → IdealItem |
| updatedAt | ISO Timestamp | |

### ModFilter
| Field | Type | Notes |
|---|---|---|
| statId | String | GGG internal stat ID |
| label | String | Human-readable e.g. '+# to maximum Life' |
| min | Number \| null | Minimum roll value |
| max | Number \| null | Maximum roll value |

### IdealItem
| Field | Type | Notes |
|---|---|---|
| idealId | String (UUID) | Primary key |
| userId | String | Foreign key → User |
| name | String | User-defined label |
| itemClass | String | |
| itemBase | String | |
| ilvl | Number | Item level for mod pool lookup |
| targetMods | Array\<TargetMod\> | Up to 6 mods |
| updatedAt | ISO Timestamp | |

### TargetMod
| Field | Type | Notes |
|---|---|---|
| statId | String | GGG internal stat ID |
| label | String | Human-readable name |
| minRoll | Number | Minimum acceptable roll |
| maxRoll | Number | Maximum roll value from game data |
| targetRoll | Number | The roll the user is aiming for |
| required | Boolean | If false, mod is 'nice to have' — affects scoring only |

### CraftingSession
| Field | Type | Notes |
|---|---|---|
| sessionId | String (UUID) | Primary key |
| userId | String | Foreign key → User |
| name | String | User-defined label |
| targetItemBase | String | |
| linkedIdealId | String \| null | |
| status | Enum | active \| complete \| scrapped |
| entries | Array\<SessionEntry\> | Currency spend log |
| outcome | Enum \| null | kept \| sold \| scrapped |
| salePrice | Number \| null | Chaos equivalent if sold |
| createdAt | ISO Timestamp | |
| completedAt | ISO Timestamp \| null | |

### SessionEntry
| Field | Type | Notes |
|---|---|---|
| entryId | String (UUID) | Primary key |
| sessionId | String | Foreign key → CraftingSession |
| currencyType | String | e.g. 'Chaos Orb', 'Exalted Orb' |
| quantity | Number | |
| chaosEquivalent | Number | Computed at time of entry using poe2.ninja rates |
| note | String \| null | |
| createdAt | ISO Timestamp | |

---

## 6. Crafting Engine — Detail

### 6.1 Mod Weight Data

Mod weights originate from reviewed datamined sources, then live in the repository's code-owned game-data catalog. The deployment workflow validates that catalog and projects it into DynamoDB. DynamoDB is the runtime store, while Git is the authoritative history of game-rule changes.

> **Key nuances the solver must handle correctly:**
> - Mod pools are restricted by item class
> - Mods have ilvl requirements
> - Prefixes and suffixes are independent pools (max 3+3 on a rare)
> - Essences guarantee one specific mod and remove it from the random pool
> - Omens modify the outcome of the next currency use
> - Annulment probability depends on current mod count
> - Magic items have a different pool structure to rares

### 6.2 Solver Architecture — Budget-Constrained Policy Search

- **State:** complete supplied item state plus remaining Exalted-equivalent budget
- **Action:** a valid existing crafting ingredient applied to that exact item
- **Reward:** sum of preference weight multiplied by tier quality
- **Policy:** state key to recommended action, with stopping allowed at any state

**Search strategy:** Bounded MCTS/UCB samples ingredient transitions and learns the action with the best terminal weighted quality for each visited state. Unknown-price actions are unavailable, actions that replace the supplied base are excluded, and every transition is checked against the hard budget.

The learned policy is evaluated by 10 concurrent workers. Each runs 500 deterministic outcomes, allowing the UI to report distributions rather than implying that one fixed sequence is guaranteed.

### 6.3 Currency Action Models

| Currency | State Transition Model | Key Probability |
|---|---|---|
| Chaos Orb | Remove one random affix, then add one eligible random affix | Weighted selection from the eligible post-removal pool |
| Exalted Orb | Add one random mod to an open affix slot | P(desired mod) = weight / sum of eligible weights |
| Orb of Annulment | Remove one random mod | P(removing unwanted) = unwanted count / total mod count |
| Regal Orb | Magic → rare, add one mod | Same model as Exalt from magic state |
| Fracturing Orb | Lock one random existing mod permanently | P(desired locked) = 1 / current mod count |
| Alloy (per type) | Remove one random affix → apply guaranteed alloy mod | P(removing unwanted) = unwanted / total; outcome deterministic |
| Orb of Augmentation | Add mod to magic item with 1 mod | P(desired mod) = weight / eligible weights |
| Essence (per type) | Guarantee one mod, reroll all others as chaos | P(remaining) = chaos probability on restricted pool |
| Omen | Modify next currency outcome | Modelled as edge weight multiplier on the following action |

### 6.4 Optimizer Output Structure

The returned result contains aggregate quality and spend, marginal preferred-mod tier probabilities, desired-mod-count and exact joint-outcome histograms, representative final item states, common policy decisions, action usage counts, and fallback metrics.
- **Branch conditions:** handle probabilistic outcomes (e.g. "If T1 life hits → step 3, else → repeat step 1")
- **Total expected cost:** sum of (currency price × expected uses)
- **Best case cost:** minimum spend if every action hits first try
- **90th percentile cost:** computed via closed-form or small Monte Carlo sample

---

## 7. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Infrastructure as Code | AWS CDK (TypeScript) | Single source of truth; no manual console changes |
| Frontend framework | Next.js (App Router) | SSR for listings, Vercel-native |
| Auth library | NextAuth.js v5 | First-class Google OAuth, JWT sessions |
| Database | DynamoDB | Serverless; all storage including mod data and cache TTL items |
| Mod data storage | Code-owned catalog projected to DynamoDB | Queried from DynamoDB at runtime; synchronized after deploy |
| Solver algorithm | Budget-constrained MCTS/UCB policy search | Learns adaptive actions while enforcing a hard spend limit |
| Policy evaluation | 10 Lambda workers × 500 deterministic outcomes | Produces stable distributions without exceeding Lambda request timeouts |
| Currency prices | poe2.ninja (10-min polling) | Stored in DynamoDB with TTL |
| GGG API access | Backend proxy Lambda only | Rate limit protection; frontend never holds GGG credentials |

---

## 8. Recommended Build Order

| Phase | Deliverable | Dependencies |
|---|---|---|
| 0 — CDK foundation | Bootstrap CDK. Define StorageStack, ApiStack, SchedulerStack. Deploy to dev. | None |
| 1 — Mod data load | Maintain reviewed equipment/mod definitions in code and project them into DynamoDB. Validate queryable by item class + ilvl. | Phase 0 |
| 2 — Auth | Google OAuth via NextAuth. DynamoDB user table. Protected routes. | Phase 0 |
| 3 — Trade search | trade-proxy Lambda. Query builder UI, results feed. | Phase 1, 2 |
| 4 — Ideal item | Ideal item editor UI, DynamoDB storage, link to saved query. | Phase 2 |
| 5 — Crafting engine | Async Step Functions budget optimizer. Price sync Lambda + EventBridge. | Phase 1, 4 |
| 6 — Item comparison | Side-by-side mod diff panel. Colour-coded status dots. Summary score bar. | Phase 3, 4 |
| 7 — Crafting integration | Wire crafting panel into trade results. Comparison → crafting steps flow. | Phase 5, 6 |
| 8 — Crafting session log | Session create/edit UI. Currency entry log. Profit/loss summary. | Phase 2 |
| 9 — GGG OAuth + listings | GGG OAuth connection. Active listings view. Raise/Lower/Competitive badges. | Phase 3, 5 |
| 10 — Simulators | Divine Orb simulator with chart. Orb of Chance with buy vs chance comparison. | Phase 5 |
| 11 — Polish | Error handling, loading states, empty states, rate limit UX. Prod CDK deploy. | Phase 7, 8, 9, 10 |

---

## 9. Page Inventory & Layouts

### 9.1 Route Map

| Route | Page | Auth | Description |
|---|---|---|---|
| `/` | Landing | Public | Marketing page. Feature overview, sign-in CTA. Redirects to /dashboard if logged in. |
| `/sign-in` | Sign In | Public | Google OAuth sign-in only. |
| `/dashboard` | Dashboard | Required | Stats overview, recent activity, quick actions, currency prices. |
| `/trade` | Trade Search | Required | Query builder, results feed, inline comparison, inline craft panel. |
| `/craft` | Craft Optimizer | Required | Budget-constrained adaptive crafting optimizer. |
| `/simulate` | Simulators | Required | Tabbed: Divine Orb + Orb of Chance simulators. |
| `/listings` | My Listings | Required | Active PoE2 listings + pricing recommendations. |
| `/queries` | Saved Queries | Required | Manage saved trade query patterns. |
| `/ideal-items` | Ideal Items | Required | Manage saved ideal item definitions. |
| `/sessions` | Session Log | Required | Crafting session history + profit/loss. |
| `/settings` | Settings | Required | Currency overrides, GGG connection, profile. |

### 9.2 Shared Layout

All authenticated pages share:
- Left sidebar (220px fixed): logo, primary nav grouped by section
- Top bar: page title, contextual actions
- Main content area: scrollable, 20px padding, dark base background

### 9.3 / — Landing Page

| Section | Content |
|---|---|
| Hero | Product name, one-line value prop, Sign in with Google CTA |
| Feature grid | 3–4 feature cards with icon and description |
| Social proof | Data sources note (poe2.ninja, RePoE2) |
| Footer | GitHub link, GGG disclaimer |

### 9.4 /dashboard — Dashboard

| Section | Content |
|---|---|
| Stats bar | 4 metric cards: Active queries, Ideal items saved, Total sessions, Net profit/loss |
| Recent activity | Chronological list of recent actions |
| Quick actions | Shortcut buttons to key tools |
| Currency prices | Mini table of key currency prices from poe2.ninja |

### 9.5 /trade — Trade Search

| Section | Content |
|---|---|
| Left panel | Item class, base type, ilvl range, mod filter rows. Save/load query. |
| Results table | Item name/base/ilvl, mod match score, listed price, est. craft cost, verdict badge |
| Expanded row | Comparison panel + top-ranked crafting path inline |

### 9.6 /craft — Craft Optimizer

| Section | Content |
|---|---|
| Input panel | Exact starting item, base type + ilvl, unrestricted weighted prefix/suffix preferences, hard budget |
| Outcome explorer | Filterable sparse joint histogram and desired-mod-count distribution |
| Results | Expected quality/spend, per-mod tier probabilities, representative items, and adaptive policy guidance |

### 9.7 /simulate — Simulators

| Section | Content |
|---|---|
| Tab bar | Divine Orb / Orb of Chance |
| Divine Orb | Mod rows with current roll + tier range + target. Probability, expected Divines, cost, distribution chart. |
| Orb of Chance | Base selector. Unique(s) on that base. Probability, expected orbs, buy vs chance comparison. |

### 9.8 /listings — My Listings

| Section | Content |
|---|---|
| Connection banner | Shown if GGG not connected |
| Filter bar | League, item class, recommendation filter |
| Listings table | Item name, listed price, market price, variance %, recommendation badge |

### 9.9 /queries — Saved Queries

| Section | Content |
|---|---|
| Header | 'New query' button |
| Table | Query name, item class/base, mod count, linked ideal item, last run, actions (Run/Edit/Delete) |

### 9.10 /ideal-items — Ideal Items

| Section | Content |
|---|---|
| Header | 'New ideal item' button |
| Grid | Card per ideal item with edit/delete actions |
| Editor modal | Item class + base + ilvl + up to 6 mod rows |

### 9.11 /sessions — Session Log

| Section | Content |
|---|---|
| Summary bar | Total sessions, total spent, net profit/loss |
| Active sessions | In-progress cards with 'Add entry' and 'Complete' actions |
| Session history | Completed sessions table with profit/loss and outcome badge |
| Session detail | Full currency entry log on click |

### 9.12 /settings — Settings

| Section | Content |
|---|---|
| Profile | Google avatar, display name, email, sign out |
| PoE Account | GGG OAuth connection status, connect/disconnect |
| Currency overrides | All currencies with poe2.ninja price + override input |
| League | Current active league selector |

---

## 10. P1 Backlog

| Feature | Notes |
|---|---|
| Trade alerts | Backend polling + SQS + Web Push/Discord |
| AI crafting assistant | Anthropic API direct embed in crafting panel |
| Deal scoring | Automated % below market price detection on results feed |
| Hardcore / SSF leagues | Separate league context; prices differ |
| Vaal orb / corruption simulation | Separate mod pool rules |
| PoB import | Import build from Path of Building to auto-populate ideal item targets |
| Recombination crafting | Complex combinatorial model |

---

## 11. Open Questions

1. **GGG trade API (grey zone):** The /api/trade2 endpoints are undocumented and technically against ToS section 7i. Consider emailing oauth@grindinggear.com to register the app officially.
2. **POESESSID refresh:** GGG sessions expire. Determine expiry cadence and build a Secrets Manager rotation mechanism or alerting when the session goes stale.
3. **poe2.ninja endpoint stability:** Confirm the JSON endpoint URL and response schema — not officially documented and could change. Add monitoring for schema changes.
4. **Mod data update process:** Establish a clear runbook for post-patch updates — pull RePoE2, review changes, run admin load script, verify in dev before prod.
5. **DynamoDB table design:** Finalise single-table vs multi-table before Phase 0 — mod data access patterns (query by item class) differ from user data (query by userId).
6. **Lambda outbound IP stability:** Rate limits apply per IP. Evaluate whether Lambda's IP pool is stable enough or if a fixed NAT Gateway IP is needed.
