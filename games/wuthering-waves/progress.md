# Wuthering Waves — progress log

Game-specific decisions only: seed data sourcing/accuracy notes, connector quirks, terminology calls that were ambiguous. Cross-cutting/architectural stage progress stays in the root `docs/progress.md` — don't duplicate it here.

---

## Added as a second-game tolerance test

This game was added while still nominally in Stage 1 (master data), specifically to test whether `apps/*`/`packages/shared` were actually game-agnostic or just happened to work for one game. It found two real gaps — one fixed as part of adding this game, one left as a known limitation:

**Fixed:** there was no shared `GameConfig` type. Each game's `config.ts` defined its own local interface, and NTE's used NTE-flavored field names (`arcTypes`, `pieceTypes`, `moduleSlots`) that leaked into `packages/shared/src/masterData.ts`'s `optionsFrom` union and into a DB column name (`characters.arc_type`). A second game would have been forced to reuse those NTE-shaped names regardless of its own vocabulary. Fixed by adding `packages/shared/src/gameConfig.ts` (generic `GameConfig` interface: `equipmentTypes`, `augmentPieceTypes`, `augmentShapes`, `maxResonanceLevel`), migrating NTE's config and the `arc_type` column to match, and building an actual game switcher (`apps/web/src/state/gameContext.tsx`, a dropdown in the Data page) since there was previously no way to view a second game's data at all — see root `docs/progress.md` for the full write-up.

**Known limitation, not fixed:** the shared `modules`/augment entity has one `setPieceCount` + one `setBonusText` field, modeling "N pieces unlocks one bonus." WuWa's real Echo system (Sonata Effects) has *two* breakpoints per set (2pc and 5pc, each with its own effect text) — the schema can't represent both as structured data, only as one combined text blob (see `seed/modules.json`). Also, `eventRewards` only models `currency`/`material` kinds, but a real WuWa event (`gift-of-thawing-frost`) grants a free *character* — not representable at all. Both are noted here rather than fixed, since extending either would be a real schema change (multi-breakpoint set bonuses; a `character` reward kind) beyond what this test called for. Flag to the user before doing either.

**Update — the `setPieceCount`/`setBonusText`/`setName` limitation above is now moot, not fixed the way this entry originally implied.** As part of an NTE-driven "Modules System Revamp" (see root `docs/progress.md`), the user confirmed same-shape set-bonus tracking wasn't worth keeping at all (a different, per-character target-based "Set" model replaced it) — those 3 columns were dropped from the shared `modules` table entirely, not extended to fix WuWa's 2pc/5pc gap. This game's 3 Echo/Sonata seed rows lost their real, sourced `setBonusText` (Void Thunder/Moonlit Clouds/Rejuvenating Glow) as a result — confirmed with the user directly before removing, since it was real data, not a placeholder. The `eventRewards` character-grant gap is untouched and still stands as noted above.

## Seed data — deliberately minimal, sourced

Not a real tracker dataset — just enough rows (5 characters spanning 5 of 6 elements and all 5 weapon types, 3 signature weapons, 3 ascension materials, 3 Echo/Sonata sets, 1 banner, 1 event) to exercise every column the schema defines. All seeded as `source: "manual"` (needs review), same convention as NTE's approximated rows.

Sourced facts (see inline citations in the research that produced this data — summarized here, not re-linked per-field):
- **Elements (6):** Aero, Electro, Fusion, Glacio, Havoc, Spectro — confirmed via wutheringwaves.fandom.com/wiki/Attribute.
- **Weapon types (5):** Sword, Broadblade, Pistols, Gauntlets, Rectifier — confirmed via wutheringwaves.fandom.com/wiki/Weapon. Note: it's "Broadblade," not "Broadsword."
- **Rank/rarity:** 4★/5★ only (no third tier, unlike NTE's S/A/B) — this game's `ranks` config is genuinely shorter than NTE's, which is itself a small confirmation that `ranks` needed to be a plain array, not a fixed-length tuple.
- **Resonance Chain:** the dupe/rank-up system, confirmed 6 nodes (S1–S6) — matches NTE's Awakening structurally (also 6 levels), which is why `maxResonanceLevel` generalized cleanly from `maxAwakeningLevel`.
- **Echo system:** 5 slots, cost budget 12, cost values 1/3/4 (officially 4 named classes — Common/Elite/Overload/Calamity — collapsed to a binary `pieceType` here, see "known limitation" above). Sonata Effects confirmed at exactly 2pc/5pc thresholds.
- **Currencies:** Astrite (premium, 160 = 1 pull), Radiant Tide (limited character banner), Lustrous Tide (standard banner, shared character+weapon), Forging Tide (limited weapon banner).
- **Pity:** 80 hard pity, ~66–70 soft pity (seeded as 66), 50/50 on character banners only (not weapon banners), loss carries a guarantee into the next 80 pulls (`carriesPity: true`).
- **Characters/weapons/materials:** Jinhsi (Spectro/Broadblade, sig. weapon "Ages of Harvest", material "Loong's Pearl"), Changli (Fusion/Sword, "Blazing Brilliance", "Pavo Plum"), Xiangli Yao (Electro/Gauntlets, "Verity's Handle", "Violet Coral"), Zhezhi (Glacio/Rectifier), Carlotta (Glacio/Pistols) — last two seeded without a sourced signature weapon/material rather than inventing one.
- **Banner:** "Thawborn Renewal" (Jinhsi's most recent confirmed rerun at research time, 2025-05-22 to 2025-06-11 server time) — used over her original v1.1 launch banner because it had a precisely sourced end date.
- **Event:** "Gift of Thawing Frost" (v1.0 7-day login event, grants Lustrous Tide + free 4★ Sanhua). End date inferred as start+7 days (2024-05-23 to 2024-05-29) — not independently confirmed, flagged in the row's notes.
- **Not seeded:** skills and all four child-row tables (material sources, skill materials, module targets, event rewards) — left empty since they'd just duplicate the pattern already proven in NTE, not test anything new.

## Echo "Slot" is really "Cost" — label + value correction

The shared `modules` entity's generic `slot`/`augmentShapes` field was displaying as "Slot (shape)" for every game (hardcoded label in `packages/shared/src/masterData.ts`). For WuWa that's wrong terminology: Echoes don't have named slots, they have a **Cost** (1/2/3/4) that a full 5-Echo build sums to a 12-cost budget against. Corrected two things:

- Added a new `terms.augmentShapeLabel` key (generic mechanism already existed via `{term:xyz}` interpolation, just wasn't wired to this field) so `masterData.ts`'s label reads `{term:augmentShapeLabel}` instead of a hardcoded string. WuWa sets it to `"Echo Cost"`; NTE sets it to `"Slot (shape)"` (unchanged wording, now sourced from its own config instead of a shared literal).
- `augmentShapes` was `["1", "3", "4"]`, missing the cost-2 tier — corrected to `["1", "2", "3", "4"]`.

The 12-cost budget constraint itself is still not enforced anywhere (no per-build cost-sum validation) — out of scope for this pass, per the user: not tracking Echo *set* names or hard cost limits yet, just fixing the field's own label and value set.

## Stage 2 — progression caps

`config.ts`'s `maxCharacterLevel`/`maxAscension`/`maxSkillLevel`/`maxEquipmentLevel` (added for the build-completion ring): character/weapon level cap **90** (base level 20, +10 per ascension), **7** ascension breakpoints (20→30→...→90), skill max level **10** (Basic Attack/Resonance Skill/Forte Circuit/Resonance Liberation/Intro Skill all share this cap). Sources: [Prydwen Resonator Progression](https://www.prydwen.gg/wuthering-waves/guides/resonator-progression), [Game8 Character Leveling Guide](https://game8.co/games/Wuthering-Waves/archives/454709). Echo slot count is a flat **5** for every character (not per-character like NTE's Console module count) — seeded on all 5 characters via `maxAugmentSlots`.
