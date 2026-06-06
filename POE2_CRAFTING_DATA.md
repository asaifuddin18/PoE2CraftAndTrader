# Path of Exile 2 — Crafting Reference Data

> **Status**: Compiled June 2026 from early-access data (latest patch: 0.5.x "Return of the Ancients").  
> The game is in active development; rules marked **[UNCERTAIN]** may change. Verify against patch notes before shipping probability logic.
>
> **Primary sources**: [Maxroll Crafting Overview](https://maxroll.gg/poe2/resources/path-of-exile-2-crafting-overview), [Fextralife PoE2 Wiki](https://pathofexile2.wiki.fextralife.com/Crafting), [Game8 PoE2](https://game8.co/games/Path-of-Exile-2/), [PoE Vault](https://www.poe-vault.com/poe2/guides/currency-and-crafting), [RePoE Fork](https://repoe-fork.github.io/poe2/), [Mobalytics](https://mobalytics.gg/poe-2/guides/essences), [Odealo Omens](https://odealo.com/articles/path-of-exile-2-list-of-omens)

---

## 1. Core Crafting Rules

### 1.1 Item Rarity States

| Rarity | Internal | Affix Slots | Notes |
|--------|----------|-------------|-------|
| Normal | White | 0 | Starting state for crafting. Extremely valuable because items cannot revert to this state once crafted (Orb of Scouring does not exist in PoE2). |
| Magic | Blue | Up to 1 Prefix + 1 Suffix (max 2 total) | Target for Transmutation → Augmentation → Regal path. |
| Rare | Yellow | Up to 3 Prefixes + 3 Suffixes (max 6 total) | Primary endgame crafting target. |
| Unique | Orange | Fixed, handcrafted modifiers | Cannot be crafted on with most currency (Vaal Orb and Divine Orb have limited interactions). |

**Critical rule**: Orb of Scouring **does not exist** in PoE2. There is no way to strip a crafted item back to Normal rarity. This makes white bases extremely valuable as crafting inputs.

### 1.2 Affix Structure: Prefix vs Suffix

Every explicit modifier on an item is either a **Prefix** or a **Suffix** — this is a fixed property of the modifier itself, not determined at roll time.

**Convention**:
- **Prefixes** generally cover: flat damage values (physical, elemental), maximum Life, maximum Mana, Spirit, local Defence Rating (armour/evasion/energy shield on armour pieces), and some weapon-local stats.
- **Suffixes** generally cover: critical strike chance, attack/cast speed, elemental resistances, attribute allocation (Str/Dex/Int), and resource recovery.

**"Open" prefix/suffix**: A slot is "open" when the item has fewer than the maximum allowed prefixes (or suffixes) for its rarity. An open prefix means a prefix can still be added; an open suffix means a suffix can still be added.

- Magic item with 1 affix: one open slot remains (prefix or suffix depending on what the existing mod is).
- Rare item with 4 affixes (e.g. 2P + 2S): has one open prefix and one open suffix.

**Implications for probability calculations**:
- When adding a mod (Exalted Orb, Augmentation) and both a prefix slot and a suffix slot are open, the slot type is chosen first with a **50/50 probability** (prefix or suffix), then a mod is drawn from that pool using weighted random selection.
- When removing a mod (Annulment Orb), the selection is uniform over **all** current explicit mods regardless of prefix/suffix status.

### 1.3 Item Level (ilvl) and Modifier Tier Gating

Every item has an **Item Level** (ilvl) set when it drops, determined by the area level or monster level that generated it. The ilvl acts as a hard gate on which modifier tiers can roll.

**Tier numbering convention (PoE2)**: **T1 = best** (highest stat range). Higher tier numbers = weaker rolls. This is the same convention as PoE1.

**How gating works**: Each modifier tier has a minimum required ilvl. If the item's ilvl is below that threshold, that tier cannot appear — even if you use a high-value currency. Lower tiers remain in the pool alongside unlocked higher tiers (creating **pool dilution**: rolling on a high-ilvl item still has a chance to land a low tier).

**Known high-end ilvl breakpoints** (verified for patch 0.5.0):

| Modifier | Tier | Min ilvl |
|----------|------|----------|
| Elemental Resistance (+41–45%) | T1 | 82 |
| Movement Speed on Boots | T1 | 82 |
| Chaos Resistance on Body Armour | T1 | 81 |
| Maximum Life on Body Armour | T1 | 84 |
| Tier 4 Fire Damage on Crossbows | T4 | 51 |

> **Rule**: A modifier's ilvl requirement also raises the item's character **level requirement** to 80% of the modifier's required ilvl. E.g. a T1 mod requiring ilvl 84 raises the item's level requirement by up to ~67.

### 1.4 Implicit vs Explicit Modifiers

- **Implicit**: Modifiers baked into the base item type (e.g., "+X to maximum Life" on a belt base). Present on Normal items. Not part of the prefix/suffix system. Not affected by most crafting currency.
  - Blessed Orb rerolls implicit modifier values within their range.
  - Vaal Orb can add an implicit (enchantment) as one of its possible outcomes.
  - "Omen of the Blessed" makes the next Divine Orb only reroll implicit modifiers.
- **Explicit**: Modifiers added by crafting currency or drops. These are the prefix/suffix mods. Affected by all crafting currency.

---

## 2. Currency Items

### 2.1 Identification

| Currency | Effect | Valid Input Rarities | Probability Model |
|----------|--------|----------------------|-------------------|
| **Scroll of Wisdom** | Identifies an unidentified item, revealing all modifiers. | Any unidentified item | Deterministic — no RNG. |

### 2.2 Rarity Upgrading Currencies

| Currency | Input Rarity | Output Rarity | Effect Detail | Probability Model |
|----------|-------------|---------------|---------------|-------------------|
| **Orb of Transmutation** | Normal | Magic | Adds 1 modifier (may be P or S). Sometimes adds 2 (1P+1S). | Uniform weighted draw from the eligible prefix pool OR suffix pool. If 2 mods: one prefix + one suffix drawn independently. |
| **Orb of Augmentation** | Magic (with 1 affix) | Magic (2 affixes) | Adds 1 affix in the open slot type (prefix if no prefix, suffix if no suffix). | Uniform weighted draw from the eligible pool for the open slot type. |
| **Regal Orb** | Magic | Rare | Upgrades Magic → Rare, keeping all existing mods and adding 1 new random mod. | Weighted draw from the eligible pool (prefix or suffix — whichever slot is open). |
| **Orb of Alchemy** | Normal | Rare | Upgrades Normal → Rare with exactly 4 affixes. Existing mods are not retained (item starts fresh). | 4 mods drawn independently from the full weighted pool. Each draw is randomly assigned prefix or suffix — there is no fixed 2P+2S guarantee; the balance is variable (could be 3P+1S, 2P+2S, 1P+3S, etc.). |

> **Note on tiered variants**: Greater and Perfect variants of Exalted Orb (and possibly other currencies) exist. **Greater Exalted Orb** guarantees mods with a minimum ilvl requirement of **35**. **Perfect Exalted Orb** guarantees mods with a minimum ilvl requirement of **50**. This means lower tiers (which require ilvl < 35 or < 50 respectively) cannot roll. These are separate currency items, not the base versions.

### 2.3 Rare Item Modification

| Currency | Input Rarity | Effect | Probability Model |
|----------|-------------|--------|-------------------|
| **Exalted Orb** | Rare (not full — must have an open affix slot) | Adds 1 random affix to a Rare item in an open slot. | Weighted draw from the eligible prefix or suffix pool for the open slot type. If both prefix and suffix slots are open, slot type is chosen first at 50/50 (prefix or suffix), then a mod is drawn from that pool by weight. |
| **Chaos Orb** | Rare | Removes 1 random modifier and replaces it with a new random modifier drawn from **any eligible mod pool** — the replacement is not restricted to the same prefix/suffix type as the removed mod. If an open slot of the opposing type exists, the replacement may be of a different type. | Step 1: Uniform random selection of one existing explicit mod. Step 2: Weighted draw of a replacement mod from the full eligible pool (prefix or suffix), constrained only by open slot availability. The replacement must differ from the mod removed. |
| **Divine Orb** | Magic or Rare | Randomizes the **numerical values** of all existing modifiers within their allowed ranges. Does not change which mods are present or their tiers. | Each modifier's value is independently re-rolled uniformly within that tier's min–max range. |
| **Orb of Annulment** | Magic or Rare | Removes 1 random modifier. | Uniform random selection across **all** current explicit mods (prefix and suffix equally). Each mod has probability = 1/N where N = total current mods. |

### 2.4 Corruption

| Currency | Input | Effect | Notes |
|----------|-------|--------|-------|
| **Vaal Orb** | Any uncorrupted item | Corrupts the item, producing one of several unpredictable outcomes: (1) Add an implicit enchantment; (2) Reroll all modifiers (like a Chaos but potentially more drastic); (3) Add a socket beyond normal limits; (4) No change (item is simply corrupted). | After corruption, the item **cannot be modified** by most crafting currency. Divine Orb and Blessed Orb interactions with corrupted items need verification. Outcome weights are **[UNCERTAIN — needs research]**. The `Omen of Corruption` makes the next Vaal Orb "more unpredictable" (broader outcome table). |

### 2.5 Rarity Conversion / Special

| Currency | Input | Effect | Notes |
|----------|-------|--------|-------|
| **Orb of Chance** | Normal | Upgrades a Normal item to a random rarity — can produce Magic, Rare, or Unique. Most outcomes are Magic or Rare; Unique is rare and item-class-specific. | The `Omen of Chance` prevents the Orb of Chance from destroying the item on failure. The `Omen of the Ancients` forces the next Orb of Chance to produce a random Unique of the same item class. |
| **Fracturing Orb** | Rare (4+ explicit mods) | Locks one random explicit modifier permanently (shown in gold text). That modifier cannot be removed, changed, or rerolled by any subsequent crafting. | See Section 6 for full rules. |

### 2.6 Quality Enhancement

| Currency | Applicable To | Effect | Notes |
|----------|--------------|--------|-------|
| **Blacksmith's Whetstone** | Martial weapons (swords, axes, maces, spears, bows, crossbows) | Increases item quality (improves physical damage for weapons). | Quality caps at 20% normally. |
| **Armourer's Scrap** | Armour pieces (helmet, body armour, gloves, boots, shield) | Increases item quality (improves defence values). | |
| **Glassblower's Bauble** | Flasks | Increases flask quality (improves flask effect). | |
| **Blessed Orb** | Any item with an implicit modifier | Re-rolls the implicit modifier's **numerical values** within their range. Does not change which implicit is present. | Similar to Divine Orb but targeting implicits only. The `Omen of the Blessed` redirects the next Divine Orb to only reroll implicits. |

### 2.7 Removed / Non-Existent in PoE2

- **Orb of Scouring**: **Does not exist** in PoE2. There is no way to strip modifiers and return an item to Normal rarity.
- **Orb of Fusing**: **Does not exist**. Sockets are on Skill Gems, not gear; all gem links are automatic.
- **Chromatic Orb**: **Does not exist**. Socket colours do not exist on gear.

---

## 3. The 13 Alloys (Patch 0.5.0 — Runes of Aldur League)

Alloys are a new crafting currency category introduced in patch 0.5.0. Each Alloy:
1. Can only be used on **Rare (yellow) items**.
2. **Removes one random existing explicit modifier** (uniform random selection across all current explicit mods).
3. **Adds one guaranteed modifier** that is unique to that alloy type and typically cannot be obtained through normal crafting.

The guaranteed mod varies by the item type it is applied to.

> **Source**: [Fextralife Wiki — individual alloy pages](https://pathofexile2.wiki.fextralife.com/Transcendent+Alloy), [aoeah.com guide](https://www.aoeah.com/news/4603--how-to-get--use-verisium-anvil-currency-items-in-poe-2-05), [Game8 alloy pages](https://game8.co/games/Path-of-Exile-2/)

### Complete Alloy List

| # | Alloy Name | Item Types | Guaranteed Mod |
|---|-----------|-----------|----------------|
| 1 | **Adaptive Alloy** | Staff | (42–52)% of Damage as Extra Fire Damage while missing Runic Ward |
| | | Wand | (21–26)% of Damage as Extra Fire Damage while missing Runic Ward |
| | | Sceptre | (30–50)% Surpassing Chance to gain a Puppet Master stack when using Command Skills |
| | | Gloves | (10–15)% increased Attack Speed while missing Runic Ward |
| 2 | **Celestial Alloy** | Caster Weapons (Staff, Wand) | +142–188 to maximum Mana AND +1 to level of all Spell Skills |
| | | Martial Weapons | +327–427 Accuracy Rating AND (5–8)% increased Attack Speed |
| 3 | **Cyclonic Alloy** | Body Armour | (15–30)% reduced effect of Slowing debuffs on you |
| | | Boots | (15–19)% increased Skill Effect Duration |
| | | Gloves | (20–25)% increased duration of damaging Ailments applied to enemies |
| | | Helmet | (35–42)% increased Archon Buff duration |
| 4 | **Expansive Alloy** | Gloves | Remnants can be collected from (35–50)% further away |
| | | Body Armour | (35–50)% increased Presence Area of Effect |
| | | Helmet | (18–29)% increased Mana Cost Efficiency |
| | | Boots | Temporary Minion Skills have +(1–2) to Limit of Minions summoned |
| 5 | **Swift Alloy** | Gloves | (9–12)% increased Cast Speed |
| | | Ring | (7–9)% increased Attack Speed |
| | | Belt | Flasks gain (0.75–1) charges per Second |
| | | Shield / Focus | (30–49)% increased Totem Placement speed |
| 6 | **Mystic Alloy** | Helmet | Spell Skills have (10–15)% increased Area of Effect |
| | | Gloves | (10–15)% increased Area of Effect for Attacks |
| | | Boots | +(10–15) to Spirit |
| | | Quiver | (25–35)% chance to Chain an additional time |
| | | Caster Weapon (Staff, Wand, Sceptre) | +1 to maximum number of Elemental Infusions |
| 7 | **Prismatic Alloy** | Gloves | (9–15)% Elemental Resistance Penetration for Damage |
| | | Martial Weapons | (20–30)% increased magnitude of Ailments you inflict |
| | | Caster Weapons (Focus, Staff, Wand) | (40–50)% increased Exposure Effect |
| | | Sceptre | (40–49)% increased magnitude of Damaging Ailments inflicted by Minions |
| 8 | **Protective Alloy** | Belt | Recover (32–45) Runic Ward when a Charm is used |
| | | Weapons (all types) | +(51–74) to maximum Runic Ward |
| | | Shield / Buckler | Recover (10–15) Runic Ward when you Block |
| 9 | **Runic Alloy** | Ring | +(37–49) to maximum Runic Ward |
| | | Amulet | (6–10)% increased maximum Runic Ward |
| | | Belt | (15–20)% increased Runic Ward Regeneration Rate |
| 10 | **Runebinder's Alloy** | Staff | (25–50)% chance to gain Nature's Archon when your Plants Overgrow |
| | | Wand | +1 to maximum Elemental Skills limit |
| | | Sceptre | +(4–5) to maximum Puppet Master stacks |
| | | Crossbow | +(2) to maximum Summoned Ballista Totems |
| | | Bow | (40–50)% increased Mark Skill effect |
| 11 | **Runefather's Alloy** | Mace | (60–75)% chance for Skills to retain 40% of Glory on use |
| | | Quarterstaff | Tempest Bells can withstand +(4–5) additional hits |
| | | Spear | +(8–10) to Weapon Range |
| | | Talisman | Hit Lightning Damage contributes to Flammability and Ignite Magnitude |
| 12 | **Sovereign Alloy** | Weapons (all types) | (20–30)% increased effect of Socketed Augment Items |
| | | Armour (Helmet, Body Armour, Gloves, Boots, Shield) | (24–30)% increased Runic Ward |
| | | Jewellery / Belt (Ring, Amulet, Belt, Talisman) | (20–30)% increased Explicit Resistance Modifier magnitudes |
| 13 | **Transcendent Alloy** | Focus, Staff, or Wand | (39–47)% increased Cast Speed AND Gain (11–16)% of Elemental Damage as Extra Cold Damage |
| | | Martial Weapon or Talisman | (15–20)% increased Physical Damage AND +(7–10) to all Attributes |

**Probability model for alloy use**:
- Let N = number of current explicit mods on the item.
- P(desired mod is removed) = 1/N.
- P(desired mod is kept) = (N−1)/N.
- The guaranteed mod is added regardless of which mod was removed.
- If the item already has the guaranteed modifier group from that alloy, the craft fails without consuming the alloy.

> **Note**: Alloys are obtained from Remnant encounters in the Runes of Aldur league mechanic. They require the Verisium Anvil crafting station to use.

---

## 4. Essences

Essences are crafting currency that **guarantee a specific modifier** on the crafted item. After patch 0.3.0 ("The Third Edict"), essences were significantly reworked.

> **Sources**: [Fextralife Essences](https://pathofexile2.wiki.fextralife.com/Essences), [Game8 Essence List](https://game8.co/games/Path-of-Exile-2/archives/487812), [poe2fun.com guide](https://poe2fun.com/guides/poe2-essence-crafting-guide)

### 4.1 Essence Tiers and Mechanics

| Tier | Input Rarity | Output | Mechanic |
|------|-------------|--------|----------|
| **Lesser** | Magic | Rare | Upgrades Magic → Rare with one guaranteed modifier (lower stat range). |
| **Normal (Essence)** | Magic | Rare | Upgrades Magic → Rare with one guaranteed modifier (mid stat range). |
| **Greater** | Magic | Rare | Upgrades Magic → Rare with one guaranteed modifier (higher stat range). |
| **Perfect** | Rare | Rare | Removes one random existing modifier from a Rare item, then adds a guaranteed modifier (often unavailable elsewhere). Functions similarly to a Chaos Orb but with a predetermined replacement. |
| **Corrupted** | Rare | Rare | Removes a random modifier from a Rare item, then adds a guaranteed modifier (special pool). |

**Lesser through Greater** tier essences: The remaining mod slots are filled randomly from the normal mod pool for that item class and ilvl (weighted selection). So a Greater Essence guarantees 1 mod; the other up to 5 mods roll normally.

**Perfect Essences**: Remove 1 random mod (uniform), add the guaranteed essence mod. Net mod count stays the same.

**Obtaining essences**: Found by defeating monsters that are encased in Essence crystals (a world encounter). Greater and Perfect essences are rarer drops, also available through the Currency Exchange NPC (unlocked after Act 3 on Cruel difficulty).

### 4.2 Complete Essence Type List

There are **19 base essence types** (each appearing in Lesser, Normal, Greater, and Perfect tiers, for ~76 distinct items plus special corrupted variants):

| Essence Name | Modifier Category | Example Guaranteed Stat (Greater tier) |
|-------------|------------------|----------------------------------------|
| **Essence of Abrasion** | Flat Physical Damage | Adds flat physical damage to weapons |
| **Essence of Alacrity** | Cast Speed | Increased Cast Speed (suffix) |
| **Essence of Battle** | Accuracy Rating | Flat Accuracy Rating on martial weapons |
| **Essence of Command** | Minion / Ally Damage | Allies/minion damage increase |
| **Essence of Electricity** | Lightning Damage | Flat lightning damage to weapons |
| **Essence of Enhancement** | Defences | Increased armour / evasion / energy shield |
| **Essence of Flames** | Fire Damage | Flat fire damage to weapons |
| **Essence of Grounding** | Lightning Resistance | +(31–35)% to Lightning Resistance |
| **Essence of Haste** | Attack Speed | (23–25)% increased Attack Speed (martial weapons) |
| **Essence of Ice** | Cold Damage | Flat cold damage to weapons |
| **Essence of Insulation** | Fire Resistance | +(31–35)% to Fire Resistance |
| **Essence of Opulence** | Item Rarity | Increased Item Rarity (helmet, gloves, boots, jewellery) |
| **Essence of Ruin** | Chaos Resistance | +(16–19)% to Chaos Resistance |
| **Essence of Seeking** | Critical Hit Chance | +(2.11–2.7)% Critical Hit Chance (martial weapons); (40–46)% increased Crit Chance for Spells (wand/focus); (60–69)% increased Crit Chance for Spells (staff) |
| **Essence of Sorcery** | Spell Damage | Increased Spell Damage (staves, wands, focus); Perfect: +3–5 to level of all Spell Skills |
| **Essence of Thawing** | Cold Resistance | +(31–35)% to Cold Resistance |
| **Essence of the Body** | Maximum Life | Flat maximum Life |
| **Essence of the Infinite** | Attributes | Flat Strength / Dexterity / Intelligence |
| **Essence of the Mind** | Maximum Mana | Flat maximum Mana |

**Special / Corrupted-only essences** (not craftable on fresh items; obtained via specific methods):

| Essence Name | Notes |
|-------------|-------|
| **Essence of Delirium** | Special mod pool |
| **Essence of Horror** | Special mod pool |
| **Essence of Hysteria** | Item-class-specific unusual mods (e.g. minion skills, movement speed variants) |
| **Essence of Insanity** | Special mod pool |
| **Essence of Torment** | Special mod pool; appears in Greater tier as well |
| **Essence of the Abyss** | Special mod pool |

> **Note on exact stats**: Modifier values vary by item class and essence tier. The Fextralife wiki has the most complete tables. The guaranteed mod always falls within the tier's stat range; the specific value within that range is random.

### 4.3 Essence Crafting — Probability Model

For a Lesser/Normal/Greater essence used on a Magic item:
- Slot 1: Guaranteed essence mod (probability = 1.0 for that mod category).
- Slots 2–5 (filling to Rare): Each drawn independently via weighted random from the normal mod pool, excluding the guaranteed mod's exclusivity group.
- The guaranteed mod counts as a prefix or suffix (fixed per essence type), leaving the opposite type's slots to fill randomly.

For a Perfect essence:
- Step 1: Remove one existing mod. P(mod X removed) = 1/N (uniform).
- Step 2: Add the guaranteed essence mod in that slot's type.
- Net slots: unchanged.

---

### 4.4 Catalysts

The end-game crafting solver models the 12 Catalysts usable on rings and amulets. An item can
have one Catalyst quality type at a time. Applying another type replaces the previous type.
Each Catalyst adds 5% quality to a Normal item, 2% to a Magic item, or 1% to a Rare item.
The default maximum is 20%; Breach Rings can explicitly carry a 40% maximum.

Omen of Catalysing Exaltation consumes all Catalyst quality after a successful Exalted Orb use
and increases the spawn weight of modifiers matching that Catalyst's tags. The observed,
community-tested multipliers are 5x at 20% quality and 7.5x at 40% quality. Intermediate
quality multipliers are not considered verified and must be configured explicitly.

## 5. Omens

Omens are single-use items that **modify the outcome of the next specific currency use**. They are activated by right-clicking (entering the player's inventory in an active state) and consumed automatically when their trigger condition fires.

**Key mechanic**: While an Omen is active in the inventory, it passively waits. Using the matching currency item consumes the Omen and alters the currency's behaviour. Two compatible Omens can be active simultaneously for combined effects (e.g., Omen of Greater Exaltation + Omen of Sinistral Exaltation = add two prefix modifiers).

**Obtaining Omens**: Primarily from completing Ritual encounters on Maps. Some Omens are available from Abyssal domain drops and Troves.

> **Sources**: [Game8 complete list](https://game8.co/games/Path-of-Exile-2/archives/491748), [Fextralife Omens](https://pathofexile2.wiki.fextralife.com/Omens), [Odealo Omens guide](https://odealo.com/articles/path-of-exile-2-list-of-omens)

### 5.1 Complete Omen List

**Exalted Orb Omens**

| Omen | Effect |
|------|--------|
| Omen of Sinistral Exaltation | Next Exalted Orb adds only **Prefix** modifiers |
| Omen of Dextral Exaltation | Next Exalted Orb adds only **Suffix** modifiers |
| Omen of Greater Exaltation | Next Exalted Orb adds **two** random modifiers |
| Omen of Catalysing Exaltation | Next Exalted Orb consumes all Catalyst Quality on the item |

**Orb of Alchemy Omens**

| Omen | Effect |
|------|--------|
| Omen of Sinistral Alchemy | Next Orb of Alchemy results in the **maximum number of Prefix** modifiers |
| Omen of Dextral Alchemy | Next Orb of Alchemy results in the **maximum number of Suffix** modifiers |

**Regal Orb Omens**

| Omen | Effect |
|------|--------|
| Omen of Sinistral Coronation | Next Regal Orb adds only **Prefix** modifiers |
| Omen of Dextral Coronation | Next Regal Orb adds only **Suffix** modifiers |

**Orb of Annulment Omens**

| Omen | Effect |
|------|--------|
| Omen of Sinistral Annulment | Next Orb of Annulment removes only **Prefix** modifiers |
| Omen of Dextral Annulment | Next Orb of Annulment removes only **Suffix** modifiers |
| Omen of Greater Annulment | Next Orb of Annulment removes **two** modifiers |
| Omen of Light | Next Orb of Annulment removes only **Desecrated** modifiers |

**Chaos Orb Omens**

| Omen | Effect |
|------|--------|
| Omen of Whittling | Next Chaos Orb removes the **lowest level** modifier |
| Omen of Sinistral Erasure | Next Chaos Orb removes only **Prefix** modifiers |
| Omen of Dextral Erasure | Next Chaos Orb removes only **Suffix** modifiers |
| Omen of Chaotic Monsters | Next Chaos Orb replaces **all** modifiers with mods granting Rare/Magic monsters (map-item use) |
| Omen of Chaotic Quantity | Next Chaos Orb replaces **all** modifiers with Pack Size mods (map-item use) |
| Omen of Chaotic Rarity | Next Chaos Orb replaces **all** modifiers with Item Rarity mods (map-item use) |

**Vaal Orb Omens**

| Omen | Effect |
|------|--------|
| Omen of Corruption | Next Vaal Orb is **more unpredictable** (broader outcome table) |

**Divine Orb Omens**

| Omen | Effect |
|------|--------|
| Omen of Sanctification | Next Divine Orb used on a Rare item **Sanctifies** it (multiplies modifier values rather than randomising) |
| Omen of the Blessed | Next Divine Orb only rerolls **Implicit** modifiers |

**Essence Omens**

| Omen | Effect |
|------|--------|
| Omen of Sinistral Crystallisation | Next Perfect or Corrupted Essence removes only **Prefix** modifiers |
| Omen of Dextral Crystallisation | Next Perfect or Corrupted Essence removes only **Suffix** modifiers |

**Orb of Chance Omens**

| Omen | Effect |
|------|--------|
| Omen of Chance | Next Orb of Chance will **not destroy** the item on failure |
| Omen of the Ancients | Next Orb of Chance upgrades to a **random Unique** of the same item class |

**Desecration Omens** (Desecration is a crafting mechanic for hidden "Desecrated" modifiers)

| Omen | Effect |
|------|--------|
| Omen of Sinistral Necromancy | Next Desecration attempt adds only **Prefix** modifiers |
| Omen of Dextral Necromancy | Next Desecration attempt adds only **Suffix** modifiers |
| Omen of Putrefaction | Next Desecration attempt replaces **all** modifiers, creating up to 6 Desecrated modifiers |
| Omen of Abyssal Echoes | Reroll Desecrated modifier options once |
| Omen of the Blackblooded | Next Desecration attempt guarantees a random **Kurgal** modifier |
| Omen of the Liege | Next Desecration attempt guarantees a random **Amanamu** modifier |
| Omen of the Sovereign | Next Desecration attempt guarantees a random **Ulaman** modifier |

**Recombination Omens**

| Omen | Effect |
|------|--------|
| Omen of Recombination | Next Predictable Recombination is **Lucky** |

> **Note**: The Omen of Recombination was removed from the game in patch 0.5.0 (and existing copies were deleted on login). Listed here for completeness but should not be modelled.

**Utility Omens** (non-crafting effects)

| Omen | Effect |
|------|--------|
| Omen of Amelioration | Prevent 75% of experience loss on death |
| Omen of Answered Prayers | Next Shrine you activate grants an additional effect |
| Omen of Bartering | Next sold item's Gold value is incorrectly assessed by the vendor |
| Omen of Gambling | Next Gamble purchase has a 50% chance of costing no Gold |
| Omen of Refreshment | Fully recover Flask and Charm charges when you reach Low Life |
| Omen of Reinforcements | Next Rogue Exile you encounter summons an ally |
| Omen of Resurgence | Fully recover Life, Mana, and Energy Shield when you reach Low Life |
| Omen of Secret Compartments | Next Strongbox you click is reopenable |
| Omen of the Hunt | Next Possessed monster killed releases its Azmeri Spirit |

---

## 6. Fracturing Orb — Detailed Rules

> **Sources**: [Pixelnitro guide 2026](https://pixelnitro.com/path-of-exile-2-fractured-item-crafting-guide-from-beginner-to-pro-2026-endgame/), [Mobalytics](https://mobalytics.gg/poe-2/guides/fracturing-orbs), [Fextralife Crafting](https://pathofexile2.wiki.fextralife.com/Crafting)

### 6.1 Prerequisites

- The target item must be **Rare** rarity.
- The target item must have **at least 4 explicit modifiers** (implicits do not count toward this requirement).
- The item must be **uncorrupted** (Vaal Orb has not been applied).

### 6.2 What Happens

1. One explicit modifier is selected **uniformly at random** (probability = 1/N, where N = total current explicit mods).
2. That modifier is **permanently locked** — it cannot be removed, changed, or rerolled by any subsequent crafting.
3. The locked modifier is displayed in **gold text** to distinguish it from normal modifiers.
4. The item becomes a **Fractured Item** (subtype of Rare).

### 6.3 Which mod gets locked — Probability Model

- **P(modifier X is locked) = 1/N** where N = total explicit mods at time of use.
- With exactly 4 mods: P(desired mod) = 25%.
- With 5 mods: P(desired mod) = 20%.
- With 6 mods: P(desired mod) = ~16.7%.

**Strategic implication**: Use the Fracturing Orb on an item with the **minimum number of mods** (4) to maximize the probability of fracturing the desired mod. Strip other unwanted mods with Orb of Annulment before fracturing.

### 6.4 What Currencies Work/Don't Work on Fractured Items

| Currency | Works on Fractured? | Notes |
|----------|--------------------|----|
| Chaos Orb | Yes | Rerolls a non-fractured modifier. Fractured mod is immune. |
| Exalted Orb | Yes | Adds a new mod to an open slot. Fractured mod is unaffected. |
| Orb of Annulment | Yes | Removes a random non-fractured modifier. Fractured mod is **not in the removal pool**. |
| Divine Orb | Yes (partial) | Divine Orb **can** be used on a fractured item. It rerolls the values of all non-fractured explicit mods within their tier ranges. The fractured mod's value is **not rerolled** — it is excluded from the Divine roll entirely. |
| Essences (Lesser–Greater) | No | Cannot upgrade a Rare item with these tiers. |
| Essences (Perfect) | Yes | Removes one random non-fractured mod, adds guaranteed mod. |
| Vaal Orb | Yes (with risk) | Can corrupt a fractured item; outcomes may include rerolling non-fractured mods. |
| Orb of Alchemy | No | Item is already Rare. |
| Fracturing Orb | No | Cannot fracture a second modifier on the same item. |

### 6.5 The Locked Mod's Behaviour During Subsequent Crafting

- The fractured mod remains on the item through all subsequent crafting.
- It counts toward the prefix or suffix total (e.g., a fractured prefix counts as one of your 3 prefix slots).
- It is excluded from removal pools (Annulment, Chaos Orb removal step, Perfect Essence removal step).
- It cannot be changed in value (Divine Orb does not affect it).
- It cannot be changed in tier or stat type.

---

## 7. Mod Pool Rules

> **Sources**: [Mobalytics Item Modifiers](https://mobalytics.gg/poe-2/guides/item-modifiers), [Mmojugg ilvl guide](https://www.mmojugg.com/news/understanding-item-tiers-in-poe2.html), [PoE Fandom Modifiers](https://pathofexile.fandom.com/wiki/Modifiers), [RePoE Fork](https://repoe-fork.github.io/poe2/)

### 7.1 Mod Pool Structure by Item Class

Every item class has its own distinct mod pool. The mod pool defines:
- Which modifiers can appear on items of that class.
- The weight of each modifier (affecting selection probability).
- The ilvl requirement for each modifier tier.
- Whether each modifier is a prefix or suffix.

The item class is determined by the base item type (e.g., Wand, Body Armour, Ring). Item class pools do not overlap — a mod that appears on Wands cannot appear on Body Armours unless explicitly added to both pools.

**Weapon-type specificity**: Even within weapons, pools differ significantly. Crossbows have access to crossbow-specific mods; bows have bow-specific mods; wands have spell-caster-oriented mods. Physical-attack-oriented mods appear on martial weapons (swords, axes, maces, spears) but not on caster weapons (wands, staves).

### 7.2 ilvl Gating of Mod Tiers

- Each modifier tier has a `required_level` value in the game data (accessible via `mods.json` in RePoE).
- An item can only roll a modifier tier if `item.ilvl >= modifier_tier.required_level`.
- **Lower tiers remain in the pool** alongside unlocked higher tiers. This creates pool dilution: a T1 mod is not guaranteed on a high-ilvl item; it competes against all lower tiers by weight.
- Example: T1 Maximum Life on Body Armour requires ilvl 84. If your item is ilvl 84, the T1 life mod is now in the pool, but T2 through T6 life mods are also still in the pool and will each draw based on their relative weight.

### 7.3 Prefix vs Suffix Assignment

- Every modifier in the game data has a fixed `generation_type` of either `prefix` or `suffix`. This does not vary — a given mod is always one or the other.
- When a currency adds a new modifier, it draws from the pool of the type corresponding to the open slot. If the item has open prefix slots, it draws from the prefix pool only. If it has open suffix slots, it draws from the suffix pool only.
- **Chaos Orb exception**: Removes one existing mod (could be prefix or suffix), then replaces it with a new mod of the **same type** from that type's pool.

### 7.4 Mod Exclusivity Groups (Mutual Exclusion)

- Every modifier belongs to exactly one **group** (called `group` in RePoE data).
- Only **one modifier per group** can appear on an item at a time. All mods in the same group are mutually exclusive.
- This is the primary source of "mod blocking": if a low-value mod from a desired group is already on the item, it prevents any higher-value mod from the same group from rolling.

**Examples of exclusivity groups** (illustrative — verify from game data):
- All Maximum Life modifiers are in the same group → only one life prefix can appear.
- All Fire Resistance modifiers are in the same group → only one fire resist suffix.
- All flat Cold Damage to Attacks modifiers are in the same group.

**Crafting implication**: If you want T1 Maximum Life but have T5 Maximum Life already, you must remove the T5 mod first (via Annulment) to unlock the possibility of T1 rolling. Simply using a Chaos Orb won't help if the T5 mod isn't removed — the replacement draw will just pick another mod from the same group, which cannot be another life mod.

### 7.5 Weight-Based Selection

The selection process for adding a random modifier:

1. Build the **eligible pool**: all modifiers of the correct type (prefix or suffix) that:
   - Belong to the item's class.
   - Have `required_level <= item.ilvl`.
   - Are not in the same exclusivity group as any currently present modifier.
2. Each eligible modifier has a **spawn_weight** value (integer in RePoE data).
3. Compute the **total weight**: `W = sum(spawn_weights)`.
4. Draw a random number `r` in `[0, W)`.
5. Walk through the pool in order, subtracting each weight until `r` is exhausted — the modifier whose weight crosses the threshold is selected.

This is standard weighted random selection (equivalent to multinomial sampling).

**Tag system**: Spawn weights can be further modified by item tags. The RePoE `mods.json` lists `spawn_weights` as an array of `{ tag, weight }` pairs. The game reads them top-to-bottom and uses the weight associated with the **first matching tag** on the item. If no tag matches, the mod cannot spawn (weight = 0). This is how item-class specificity and special bases (e.g., influenced items) are implemented.

### 7.6 `mods.json` Spawn Weight Format (RePoE)

```json
{
  "ExampleMod_1": {
    "required_level": 68,
    "generation_type": "prefix",
    "group": "MaximumLife",
    "type": "ModType",
    "tags": ["armour", "helmet", "body_armour", "gloves", "boots"],
    "spawn_weights": [
      { "tag": "body_armour", "weight": 1000 },
      { "tag": "helmet",      "weight": 500 },
      { "tag": "default",     "weight": 0 }
    ],
    "stats": [
      {
        "id": "base_maximum_life",
        "min": 100,
        "max": 119
      }
    ]
  }
}
```

Key fields:
- `required_level`: Minimum ilvl for this tier to appear.
- `generation_type`: `"prefix"` or `"suffix"`.
- `group`: Exclusivity group identifier. Only one mod per group per item.
- `spawn_weights`: Ordered list. Game uses first matching tag's weight.
- `stats`: Array of `{id, min, max}` defining the roll range.

The `mods_by_base.json` file provides the same data indexed by base item type instead of mod ID, which may be more convenient for lookup by item class.

---

## 8. Special Crafting Interactions

### 8.1 Magic Item Crafting Path: Transmutation → Augmentation → Regal

The primary path for targeted magic-to-rare crafting:

```
Normal item
  → [Orb of Transmutation] → Magic item (1 random affix)
  → [Orb of Augmentation] → Magic item (2 affixes: 1P + 1S)
  → [Orb of Annulment] → Magic item (1 affix, back one step)  [optional, to reroll one]
  → [Regal Orb] → Rare item (2 existing affixes + 1 new random affix)
```

**Use case**: You want to lock in two specific mods (e.g., a T1 prefix and a T1 suffix). You craft on a Magic item, rerolling with Transmutation (resets to 1 mod) or Annulment (removes 1) until you have both desired mods on the magic item, then Regal to convert to Rare (accepting a random 3rd mod).

**Expected cost calculation**:
- P(Transmutation lands desired prefix) = weight(desired_prefix) / sum(all_prefix_weights)
- P(Augmentation lands desired suffix | prefix already present) = weight(desired_suffix) / sum(eligible_suffix_weights_excluding_prefix_group)
- Expected Transmutations = 1/P(prefix), expected Augmentations = 1/P(suffix)

### 8.2 Essence Crafting — Probability Model

When using a Lesser/Normal/Greater Essence on a Magic item:
- The Essence guarantees 1 specific modifier (probability = 1.0 for that mod).
- The item is upgraded to Rare with additional random mods filling the remaining slots.
- Let E = the essence mod's type (prefix or suffix).
- The remaining 3 slots (up to) are filled from the eligible pool, excluding E's exclusivity group.
- P(any specific additional mod X) = weight(X) / (sum_of_eligible_weights_excluding_E_group)

When using a Perfect Essence on a Rare item:
- Step 1: Uniform removal of one existing mod (P = 1/N).
- Step 2: The guaranteed mod is added. This is deterministic.
- Net: One unknown mod lost, one known mod gained.

### 8.3 Orb of Annulment — Probability Model

P(specific mod X is removed) = 1/N

Where N = total number of current explicit mods on the item (prefix + suffix combined). The selection is **uniform** — all mods have equal chance of being removed regardless of tier, type, or value.

**Omens modify this**:
- Omen of Sinistral Annulment: restricts N to prefix mods only → P(prefix mod X) = 1/(number of prefixes).
- Omen of Dextral Annulment: restricts N to suffix mods only → P(suffix mod X) = 1/(number of suffixes).
- Omen of Greater Annulment: removes 2 mods in sequence (uniform each time without replacement).
- Omen of Light: restricts to Desecrated mods only.

On a Fractured item, the fractured modifier is **excluded** from the pool: effective N = (total mods - 1).

### 8.4 Chaos Orb — Sequential Not Simultaneous

The Chaos Orb does **not** reroll all mods simultaneously. It operates sequentially:
1. Remove 1 random existing explicit modifier (uniform selection, P = 1/N per mod).
2. Draw 1 replacement modifier of the same type (prefix or suffix) from the weighted pool, excluding the removed mod's group and all currently remaining mods' groups.

**Implications**:
- If the item has 6 mods (full rare), removing one and replacing it means the 5 remaining mods stay exactly as they were.
- You cannot use Chaos Orb to reroll the entire rare item from scratch (unlike PoE1's Chaos Orb, which rerolls all mods). **[Important difference from PoE1]**
- If you want a full reroll, use Orb of Alchemy on a Normal item.

**Omen interactions with Chaos Orb**:
- Omen of Whittling: targets the lowest level (lowest `required_level`) modifier for removal.
- Omen of Sinistral/Dextral Erasure: restricts the removal step to only prefixes or only suffixes.

### 8.5 Exalted Orb — When Both Slots Are Open

When a Rare item has both open prefixes and open suffixes, the Exalted Orb chooses the slot type first at **50/50** (prefix or suffix), then draws a mod from that pool by weight.

**Omen of Greater Exaltation**: Adds 2 mods. If only 1 slot is open of one type, the second draw must be from the other type. Sequential draws.

---

## 9. Item Classes (Craftable)

All of these item classes have distinct mod pools and can be crafted on with currency. Classes marked with * are PoE2-specific.

### 9.1 Weapons

| Item Class | Subcategory | Notes |
|-----------|-------------|-------|
| One Hand Axe | Martial | Physical + attack-focused mods |
| Two Hand Axe | Martial | |
| One Hand Mace | Martial | Includes maces and sceptres as separate sub-types |
| Two Hand Mace | Martial | |
| Sceptre | Martial/Caster hybrid | Has both attack and some spell mods |
| One Hand Sword | Martial | |
| Two Hand Sword | Martial | |
| Thrusting One Hand Sword | Martial | Separate class from regular swords |
| Dagger | Martial/Crit | |
| Rune Dagger* | Caster | PoE2-specific — caster dagger variant |
| Spear* | Martial | PoE2-specific |
| Quarterstaff* | Martial | PoE2-specific — uses both hands, melee |
| Staff | Caster | Primarily spell-damage mods |
| Wand | Caster | One-handed caster weapon |
| Bow | Martial | Ranged; projectile-specific mods |
| Crossbow* | Martial | PoE2-specific ranged weapon; separate mod pool from Bow |

### 9.2 Armour

| Item Class | Defence Type | Notes |
|-----------|-------------|-------|
| Body Armour | Armour / Evasion / ES / hybrid | 2 socket slots (largest) |
| Helmet | Armour / Evasion / ES / hybrid | 1 socket slot |
| Gloves | Armour / Evasion / ES / hybrid | 1 socket slot |
| Boots | Armour / Evasion / ES / hybrid | 1 socket slot; Movement Speed suffix available |
| Shield | Armour / Evasion / ES / hybrid | |
| Buckler* | Evasion | PoE2-specific evasion-focused shield variant |

### 9.3 Off-Hand / Caster Tools

| Item Class | Notes |
|-----------|-------|
| Focus* | PoE2-specific off-hand for casters; enables Elemental Infusions; caster mod pool |
| Quiver | Off-hand for Bows; bow-specific mods |

### 9.4 Jewellery

| Item Class | Notes |
|-----------|-------|
| Ring | Resistance and attribute-heavy mods; 2 rings equipped |
| Amulet | Mix of offensive and defensive; 1 slot |
| Belt | Movement, life, flask, and attribute mods; 1 slot |
| Talisman* | PoE2-specific jewellery slot; Runic Ward and special mods |

### 9.5 Jewels

| Item Class | Notes |
|-----------|-------|
| Jewel | Placed in passive tree jewel sockets; own distinct mod pool |
| Abyss Jewel | Special jewel type with life-on-kill and similar mods |

### 9.6 Flasks

| Item Class | Notes |
|-----------|-------|
| Life Flask | Modded with use-speed, recovery mods |
| Mana Flask | |
| Hybrid Flask | |
| Utility Flask | Status-effect utility; own mod pool |

> **Note**: Skill Gems are not modded via currency. Sockets are on Gems, not gear. The gem-cutting system (Gemcutting) uses its own resources (Gemcutter's Prisms) to improve gem quality, not the item crafting system.

---

## 10. RePoE2 Data Source

> **Repository**: [repoe-fork/repoe on GitHub](https://github.com/repoe-fork/repoe)  
> **PoE2 Data Export**: [repoe-fork.github.io/poe2/](https://repoe-fork.github.io/poe2/)  
> **Current version**: 4.5.0.3.3 (as of June 2026)

### 10.1 Available Files for PoE2

Each file is available in both standard JSON and minified (`.min.json`) format:

| File | Description |
|------|-------------|
| `mods.json` | All modifier definitions indexed by mod ID. Contains spawn weights, required level, type (prefix/suffix), group, stat ranges. |
| `mods_by_base.json` | Same modifier data, indexed by base item type. Useful for "what mods can appear on this specific base?" queries. |
| `base_items.json` | All base item definitions including item class, tags, implicit modifiers. |
| `item_classes.json` | Item class IDs and their associated tags. |
| `essences.json` | Essence data including which mod each essence guarantees per item class. |
| `uniques.json` | Unique item definitions. |
| `skills.json` / `skill_gems.json` | Skill gem data. |
| `stats.json` / `stats_by_file.json` | Stat IDs and translations. |
| `tags.json` / `tag_details.json` | Tag definitions used by spawn weight system. |
| `characters.json` | Character class stat data. |
| `world_areas.json` | Area level data (useful for ilvl context). |
| `augments.json` | Augmentation data. |
| `cost_types.json` | Currency cost types. |
| `ascendancies.json` | Ascendancy class data. |
| `buffs.json` | Buff/debuff definitions. |

### 10.2 `mods.json` Schema (Key Fields)

```json
{
  "<ModId>": {
    "required_level": <int>,           // Minimum ilvl for this tier to appear
    "generation_type": "prefix"|"suffix"|"corrupted"|"unique",
    "group": "<string>",               // Exclusivity group — only 1 mod per group per item
    "type": "<ModType>",               // Internal mod type classification
    "tags": ["<tag1>", "<tag2>", ...], // Item class / property tags this mod can appear on
    "spawn_weights": [
      { "tag": "<tag>", "weight": <int> },
      // Game reads top-to-bottom; uses first matching tag's weight
      // weight=0 means this mod cannot spawn when that tag applies
    ],
    "generation_weights": [
      { "tag": "<tag>", "weight": <int> }
      // Modifies the effective weight after spawn_weights resolve
    ],
    "stats": [
      {
        "id": "<stat_id>",             // e.g. "base_maximum_life"
        "min": <int>,
        "max": <int>
      }
    ],
    "name": "<string>",                // Human-readable mod name
    "tier": <int>                      // Tier number (T1 = best in PoE2)
  }
}
```

### 10.3 How to Load into DynamoDB

**Recommended table structure**:

```
Table: poe2_mods
PK: mod_id (string)
SK: item_class (string)  [or use GSI]

Attributes:
  required_level: Number
  generation_type: String  ("prefix" | "suffix")
  group: String
  spawn_weight: Number     (resolved weight for this item_class)
  stats: List<Map>         [{stat_id, min, max}]
  tier: Number
  tags: StringSet
```

**Loading strategy**:
1. Parse `mods.json` (one entry per mod ID).
2. For each mod, iterate over `spawn_weights` to determine which item classes it applies to (weight > 0).
3. For each (mod, item_class) pair with weight > 0, write a DynamoDB item.
4. For probability calculations, query by `item_class` + filter by `required_level <= target_ilvl` + filter by `generation_type`.
5. Compute total weight for the filtered pool, then apply weighted selection.

Cross-reference `item_classes.json` to map item class names to their canonical tags (e.g., `body_armour` tag → "Body Armour" class).

### 10.4 `essences.json` Structure

The `essences.json` file maps each essence type to the specific mod it guarantees per item class. Use this for essence crafting probability calculations — the guaranteed mod is a lookup rather than a weighted draw. The remaining mods use the normal `mods.json` weighted selection.

---

## 11. Patch History Notes

| Patch | Key Crafting Changes |
|-------|---------------------|
| 0.1.0 (Dec 2024) | Initial early access launch. Core crafting system established. |
| 0.2.0 | Various balance changes to currency drop rates. |
| 0.3.0 "The Third Edict" | **Essence system reworked**: 4 tiers (Lesser/Normal/Greater/Perfect) introduced; essences now upgrade quality and guarantee mod based on item class. Chaos Orb confirmed as single-mod replacement (not full reroll). Some new Omens added (Desecration-related). |
| 0.4.0 | Additional balance passes; Greater Orb of Transmutation min modifier level reduced. |
| 0.5.0 "Return of the Ancients / Runes of Aldur" | **13 Alloys** introduced. **Verisium** and **Runeforging** system added. **Recombinator** removed. **Omen of Recombination** removed. **Sanctification** mechanic added (Divine Orb + Omen of Sanctification). 12 new Catalyst types. Greater Orb of Transmutation/Augmentation min level reduced from 55 to 44. |

---

## 12. Known Uncertainties and Gaps

Items still requiring verification from game data or patch notes before implementing in probability calculations:

1. ~~**Chaos Orb — Prefix/Suffix replacement constraint**~~ **RESOLVED**: Replacement is drawn from any eligible mod pool — not restricted to same type. A prefix can be removed and a suffix added if an open suffix slot exists (and vice versa).

2. ~~**Exalted Orb — selection when both slot types are open**~~ **RESOLVED**: 50/50 chance between prefix pool and suffix pool, then weighted draw within the chosen pool.

3. ~~**Divine Orb on fractured items**~~ **RESOLVED**: Divine Orb can be used. It rerolls all non-fractured mods normally. The fractured mod's value is excluded from the roll entirely.

4. ~~**Alloy use when item already has the alloy's guaranteed mod**~~ **RESOLVED**: Re-writes it — removes a random mod, then overwrites/re-applies the guaranteed mod.

5. **Corruption (Vaal Orb) outcome weights**: The exact probability distribution among possible Vaal Orb outcomes (enchantment add / mod reroll / extra socket / no change) is not publicly documented. **Needs research.**

6. ~~**Orb of Alchemy exact mod count**~~ **RESOLVED**: Exactly 4 affixes. Prefix/suffix balance is random per draw (not fixed 2P+2S).

7. ~~**Tiered currency (Greater/Perfect Orbs)**~~ **RESOLVED**: Greater Exalted Orb guarantees min ilvl 35 mods. Perfect Exalted Orb guarantees min ilvl 50 mods.

8. **Essence of Torment and special essences**: Some essences (Horror, Hysteria, Insanity, Delirium, Abyss) appear at Normal tier only. Their exact mod tables need verification.

9. **Alloy 13th entry ambiguity**: Some sources list only 12 distinct alloy names. The 13th may be a regional variant or not yet fully documented. Needs verification.

---

*Document compiled from web sources as of June 2026. The game is in early access; verify all rules against the current patch notes at [pathofexile.com](https://www.pathofexile.com/forum) before relying on this data for production use.*
