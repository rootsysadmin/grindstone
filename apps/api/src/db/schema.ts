import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Shared by every master-data table: which game a row belongs to, how it
// got there (source), whether it's ready to show up in the tracker
// (status), and basic audit fields. Kept as a plain object spread into
// each table rather than a Drizzle "mixin" (sqlite-core has none) — see
// apps/api/CLAUDE.md.
const masterDataColumns = {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  source: text("source", { enum: ["auto", "manual", "override"] })
    .notNull()
    .default("manual"),
  status: text("status", { enum: ["draft", "published"] })
    .notNull()
    .default("published"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedBy: text("updated_by"),
};

export const elements = sqliteTable(
  "elements",
  {
    ...masterDataColumns,
    colour: text("colour"),
    shortCode: text("short_code"),
  },
  (t) => ({ gameSlugIdx: uniqueIndex("elements_game_slug_idx").on(t.gameId, t.slug) }),
);

/**
 * Replaces the old hardcoded per-game `ranks: string[]` config (and
 * materials' separate hardcoded 6-tier color ramp) with one editable,
 * per-game master-data table — same "promote a hardcoded config list to
 * its own table" move already made once for currencies (see
 * docs/progress.md's Stage 1 follow-up). Different games use different
 * tier counts (NTE: 3, Wuthering Waves: 2, others seen up to 5+), so this
 * is freely configurable rather than a fixed universal scale.
 */
export const rankTiers = sqliteTable(
  "rank_tiers",
  {
    ...masterDataColumns,
    level: integer("level").notNull(), // ascending = stronger (1 = weakest) — drives sort order, not just display
    color: text("color").notNull(), // hex, e.g. "#F0B44A" — badge/border/gradient all derive from this one value
  },
  (t) => ({ gameSlugIdx: uniqueIndex("rank_tiers_game_slug_idx").on(t.gameId, t.slug) }),
);

export const materials = sqliteTable(
  "materials",
  {
    ...masterDataColumns,
    rankTierId: integer("rank_tier_id"),
    category: text("category"),
    weeklyCap: integer("weekly_cap"),
    // EXP-material support: a material with expValue set is a fungible EXP
    // source (e.g. NTE's Hunter Guides I/II/III = 1000/5000/20000, Wuwa's 4
    // tiers) — any combination of EXP mats totaling the required amount
    // works interchangeably, unlike ascension materials which are specific
    // items. expUsage scopes which pool it belongs to: character-leveling
    // and weapon-leveling EXP materials are NOT interchangeable pools, per
    // the user (confirmed real-game behavior) — so this is required to know
    // which pool a given EXP material's stock counts toward.
    expValue: integer("exp_value"),
    expUsage: text("exp_usage", { enum: ["character", "equipment"] }),
    craftsIntoId: integer("crafts_into_id"),
    // A substitute that can cover a shortfall of this material — shown as
    // an informational hint on the planner (that material's own name +
    // current stock), never folded into the shortfall math itself, since no
    // conversion ratio is tracked (see docs/progress.md's Stage 3 entry for
    // why: NTE has multi-tier crafting and a flexible "heterogeneous unit"
    // that can't be represented as a single fixed-ratio relation anyway).
    alternativeMaterialId: integer("alternative_material_id"),
    // no dropsFrom column — a material can drop from multiple places, so
    // "where" lives in materialSources (one row per source) instead of a
    // single vague text field.
  },
  (t) => ({ gameSlugIdx: uniqueIndex("materials_game_slug_idx").on(t.gameId, t.slug) }),
);

/** Where a material can be obtained — a material may have several. Not a top-level tab; edited inline from the material's record editor. */
export const materialSources = sqliteTable("material_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  materialId: integer("material_id").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
});

export const characters = sqliteTable(
  "characters",
  {
    ...masterDataColumns,
    rankTierId: integer("rank_tier_id"),
    elementId: integer("element_id"),
    role: text("role"),
    releaseDate: text("release_date"),
    ascensionMaterialId: integer("ascension_material_id"),
    maxAugmentSlots: integer("max_augment_slots"), // per-character module/echo slot count (varies 4-8+ per the user's account of NTE's Console system) — the ring's "Modules" segment divides equipped count by this
  },
  (t) => ({ gameSlugIdx: uniqueIndex("characters_game_slug_idx").on(t.gameId, t.slug) }),
);

export const skills = sqliteTable(
  "skills",
  {
    ...masterDataColumns,
    characterId: integer("character_id").notNull(),
    slot: text("slot"),
    // Optional per-skill override of the game's flat maxSkillLevel config
    // (most skills share one cap; the edge case is a skill that doesn't —
    // e.g. an Ultimate capped lower than Basic/Esper skills). Null means
    // "use the game's flat cap" — see buildProgress.ts.
    maxLevel: integer("max_level"),
    // Deliberately no scalesWith/effectText: the tracker assumes a build
    // target is always max level, so those aren't tracked. Upgrade
    // materials/quantities live in skillLevelCosts, per level band.
  },
  (t) => ({ gameSlugIdx: uniqueIndex("skills_game_slug_idx").on(t.gameId, t.slug) }),
);

export const equipmentItems = sqliteTable(
  "equipment_items",
  {
    ...masterDataColumns,
    rankTierId: integer("rank_tier_id"),
    type: text("type"),
    mainStat: text("main_stat"),
    passiveText: text("passive_text"),
  },
  (t) => ({ gameSlugIdx: uniqueIndex("equipment_items_game_slug_idx").on(t.gameId, t.slug) }),
);

/**
 * Covers both halves of the Console gear system in one table/tab, split by
 * `pieceType` (per the user, confirmed over research-based guesses):
 * - Cartridge: the main piece. A character equips exactly one, picked from
 *   a fixed catalog. `mainStat` here is *not* meaningful for Cartridges —
 *   the real main stat is RNG-rolled per pull, tracked per-instance on
 *   `ownedAugments.mainStat` (and per-target on `moduleTargets.mainStatTarget`)
 *   instead, both kept distinct from their `substats` JSON.
 * - Module: the sub pieces. Each is a fixed shape (`slot`: 2/3/4, an
 *   exclusive shape identity, not just a size) with RNG substats on drop.
 *   Stacking same-shape set-bonus tracking (setName/setPieceCount/
 *   setBonusText) was scaffolded early and dropped — no computed or
 *   catalog-level set-bonus concept exists here. Instead, each character
 *   has a "Set" (1 Cartridge + their `maxAugmentSlots` Modules) built by
 *   scoping `moduleTargets` rows to them via `forCharacterId` — see
 *   `moduleTargets` below and `apps/web/src/features/roster/moduleSet.ts`.
 */
export const modules = sqliteTable(
  "modules",
  {
    ...masterDataColumns,
    pieceType: text("piece_type", { enum: ["Cartridge", "Module"] }).notNull().default("Module"),
    slot: text("slot"), // Module-only: the 2/3/4 shape type. Unused for Cartridges.
    mainStat: text("main_stat"),
    maxLevel: integer("max_level"),
  },
  (t) => ({ gameSlugIdx: uniqueIndex("modules_game_slug_idx").on(t.gameId, t.slug) }),
);

/**
 * An ideal roll to chase for a Cartridge or Module — tracking every
 * possible RNG roll isn't feasible (RNG is locked in on acquisition and
 * never rerolled, per the user), so master data instead records one or
 * more named target specs (e.g. "Crit build" vs "ATK build") to farm
 * toward and check an owned piece against. Since the same piece is often
 * farmed multiple times for different characters with different substat
 * needs, each target optionally names which character it's for —
 * `forCharacterId` is nullable because a target can also be
 * character-agnostic (e.g. a generic "any DPS" build). `substats` is a
 * JSON array of {stat, value} pairs — no priority ranking, per the
 * "somewhere in between" call: more structured than bare tag names, but
 * not a full child table per substat since nothing else needs to
 * reference one individually.
 *
 * A character's "Set" (1 Cartridge + their `maxAugmentSlots` Modules) is
 * not a separate table — it's every row here with `forCharacterId` pointing
 * at that character, grouped by the parent module's `pieceType`. No new
 * field for "is this in the set": scoping a target to a character *is*
 * putting it in their set. See `apps/web/src/features/roster/moduleSet.ts`.
 *
 * `achievedAt` is the "mark as achieved" checkbox this table's original
 * design anticipated — deliberately NOT a match against a real owned
 * piece's rolled stats (too fiddly to be worth it, per the user): just a
 * manual tick for "I've got a piece I'm happy with for this target," so a
 * character's remaining gear need can be read off as a count without
 * matching exact rolls. Null = not yet achieved.
 */
export const moduleTargets = sqliteTable("module_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  moduleId: integer("module_id").notNull(),
  forCharacterId: integer("for_character_id"),
  label: text("label").notNull(),
  mainStatTarget: text("main_stat_target"),
  substats: text("substats"), // JSON: { stat: string, value: string }[]
  notes: text("notes"),
  achievedAt: integer("achieved_at"), // unix seconds; null = not yet achieved
});

/**
 * A resource a player accumulates/spends — premium currency, pull tickets,
 * shop tokens, soft/progression currency. Master data, not a balance: how
 * much a player *has* is user-state (a future inventory/ledger feature),
 * this table only records what a currency *is*. `convertsToId` is a
 * self-relation for currencies obtainable by converting another (e.g. a
 * pull ticket bought with premium currency) — nullable, since most
 * currencies aren't obtained that way.
 */
export const currencies = sqliteTable(
  "currencies",
  {
    ...masterDataColumns,
    rankTierId: integer("rank_tier_id"), // new — currencies never had a rank before, left unset until assigned by hand
    category: text("category"), // e.g. "Premium", "Pull ticket", "Progression", "Shop token"
    shortCode: text("short_code"),
    pullCost: integer("pull_cost"), // units of this currency spent per pull, where that's a fixed number
    convertsToId: integer("converts_to_id"),
    conversionRate: text("conversion_rate"), // free text, e.g. "160 -> 1" — rates vary too much in shape (fixed ratio, shop-only, one-way) for a strict numeric pair
    spendsOn: text("spends_on"),
  },
  (t) => ({ gameSlugIdx: uniqueIndex("currencies_game_slug_idx").on(t.gameId, t.slug) }),
);

export const banners = sqliteTable(
  "banners",
  {
    ...masterDataColumns,
    type: text("type"),
    featuredCharacterId: integer("featured_character_id"),
    featuredEquipmentId: integer("featured_equipment_id"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    pity: integer("pity"),
    softPity: integer("soft_pity"),
    fiftyFifty: integer("fifty_fifty", { mode: "boolean" }).notNull().default(true),
    carriesPity: integer("carries_pity", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({ gameSlugIdx: uniqueIndex("banners_game_slug_idx").on(t.gameId, t.slug) }),
);

export const events = sqliteTable(
  "events",
  {
    ...masterDataColumns,
    kind: text("kind"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    stageCount: integer("stage_count"),
    notes: text("notes"),
    // no currencyReward/materialRewards columns — an event's rewards are
    // usually a mix of several currencies and materials, so they live in
    // eventRewards (one row per reward) instead of two flat fields.
  },
  (t) => ({ gameSlugIdx: uniqueIndex("events_game_slug_idx").on(t.gameId, t.slug) }),
);

/** One reward line for an event (a currency amount, or a material + quantity) — an event usually has several. Not a top-level tab. */
export const eventRewards = sqliteTable("event_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  eventId: integer("event_id").notNull(),
  kind: text("kind", { enum: ["currency", "material"] }).notNull(),
  currencyId: integer("currency_id"),
  materialId: integer("material_id"),
  quantity: integer("quantity"),
});

// ---------------------------------------------------------------------------
// Stage 2 — user-state tables (roster/builds/teams). No masterDataColumns:
// no source/status/draft-publish, since that provenance system is for the
// master-data catalog above, not live player state. Still scoped by game_id.
// ---------------------------------------------------------------------------

/**
 * One row per *owned* character — a character with no row here is simply
 * not owned, so this table doubles as the ownership marker rather than a
 * separate owned_characters table. equippedEquipmentLevel/Refinement are
 * about the equipped Arc/weapon itself, not the character.
 */
export const characterBuilds = sqliteTable(
  "character_builds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    characterId: integer("character_id").notNull(),
    level: integer("level").notNull().default(1),
    // No ascension column — it's a natural byproduct of leveling, not a
    // separately trackable goal (the user's call). resonanceLevel is
    // tracked for display (e.g. the roster card's "S6" badge) but
    // deliberately excluded from the build-completion ring — see
    // buildProgress.ts and docs/progress.md.
    resonanceLevel: integer("resonance_level").notNull().default(0),
    equippedEquipmentItemId: integer("equipped_equipment_item_id"),
    equippedEquipmentLevel: integer("equipped_equipment_level"),
    equippedEquipmentRefinement: integer("equipped_equipment_refinement"),
    notes: text("notes"), // free text — covers both rotation notes and awakening/resonance-unlock notes; no structured unlock list (see docs/progress.md)
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false), // Stage 5: shows on the Today Overview's roster rollup ("6 pinned" / "pin more")
    ownedAt: integer("owned_at")
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ gameCharacterIdx: uniqueIndex("character_builds_game_character_idx").on(t.gameId, t.characterId) }),
);

/** Current level of one of a character's skills — a skill with no row here is level 0. Not a top-level tab. */
export const characterSkillLevels = sqliteTable(
  "character_skill_levels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    characterId: integer("character_id").notNull(),
    skillId: integer("skill_id").notNull(),
    level: integer("level").notNull().default(0),
  },
  (t) => ({
    gameCharacterSkillIdx: uniqueIndex("character_skill_levels_game_char_skill_idx").on(t.gameId, t.characterId, t.skillId),
  }),
);

/**
 * A real owned Cartridge/Module (or Echo) instance — distinct from
 * module_targets (an ideal to farm toward, not a real pull). `moduleId`
 * says which piece *type* this is; `characterId`/`slotIndex` say where
 * it's equipped, both null meaning "in bag." Matching an owned roll
 * against its module_targets ideal is not attempted here — the ring only
 * counts slot occupancy, not roll quality.
 */
export const ownedAugments = sqliteTable("owned_augments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  moduleId: integer("module_id").notNull(),
  mainStat: text("main_stat"),
  substats: text("substats"), // JSON: { stat: string, value: string }[] — same shape as module_targets.substats
  level: integer("level"),
  characterId: integer("character_id"), // null = unequipped ("in bag")
  slotIndex: integer("slot_index"), // meaningful only when characterId is set
  acquiredAt: integer("acquired_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A user-defined stat target for a character — "CRIT Rate" -> target
 * "70%", current "64%" — manually maintained, nothing computed. Same
 * "define an ideal, compare against reality" pattern as module_targets.
 * "Met" (target reached) is decided by parsing the leading numeric portion
 * of both strings; a target that doesn't parse is excluded from the ring
 * rather than guessed at. Child rows of a character, not a top-level tab.
 */
export const characterStatTargets = sqliteTable("character_stat_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  characterId: integer("character_id").notNull(),
  statName: text("stat_name").notNull(),
  targetValue: text("target_value"),
  currentValue: text("current_value"),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  teamId: integer("team_id").notNull(),
  characterId: integer("character_id").notNull(),
  roleLabel: text("role_label"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * One row per game — the numeric progression ceilings the build-completion
 * ring divides by (character/skill/equipment level caps, resonance level
 * count). These used to be static values in games/<slug>/config.ts, but a
 * game's own level caps can rise with a patch, and there's no reason that
 * should require editing source and rebuilding — so they're real,
 * runtime-editable data now (GET/PATCH /api/games/:game/settings), seeded
 * once from games/<slug>/seed/game-settings.json. No frontend edit UI yet
 * (the user's call — API-editable is enough for now), but the API is real.
 */
export const gameSettings = sqliteTable(
  "game_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    maxCharacterLevel: integer("max_character_level").notNull(),
    maxSkillLevel: integer("max_skill_level").notNull(),
    maxEquipmentLevel: integer("max_equipment_level").notNull(),
    maxResonanceLevel: integer("max_resonance_level").notNull(),
  },
  (t) => ({ gameIdx: uniqueIndex("game_settings_game_idx").on(t.gameId) }),
);

// ---------------------------------------------------------------------------
// Stage 3 — material cost schedules (master data: real game facts, sourced
// once, shared by every player — not user-state, but no masterDataColumns
// either, same category as module_targets). One shape reused
// three times: a level-band cost row (fromLevel -> toLevel costs `quantity`
// of `materialId`). For character/equipment this is a wide ascension-style
// band (e.g. 1 -> 20); for skills every row is naturally a single-level band
// (e.g. 6 -> 7) — same shape, same "remaining need" query either way:
// SUM(quantity) WHERE toLevel > <current level>. See docs/progress.md's
// Stage 3 entry for why this replaced an earlier flat-manual-need design.
//
// EXP-based leveling follow-up: characterLevelCosts/equipmentLevelCosts rows
// can now be one of two `kind`s within the same band — a `material` row
// (the original shape: specific materialId + quantity, for ascension-gate
// materials) or an `exp` row (a flat expAmount, satisfied by ANY combination
// of materials.expValue-flagged mats in that entity's EXP pool — see
// materials.expUsage above). A band can mix both kinds. skillLevelCosts is
// deliberately NOT extended — skill leveling stays material-only, per the
// user (EXP-based leveling only applies to characters/weapons).
// ---------------------------------------------------------------------------

export const characterLevelCosts = sqliteTable("character_level_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  characterId: integer("character_id").notNull(),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  kind: text("kind", { enum: ["material", "exp"] }).notNull().default("material"),
  materialId: integer("material_id"), // set when kind = "material"
  quantity: integer("quantity"), // set when kind = "material"
  expAmount: integer("exp_amount"), // set when kind = "exp"
  // Stage 10 follow-up — lets a repo sync attach cost bands to a character
  // without overwriting a hand-corrected one; same auto/manual/override
  // upsert convention as every other synced entity, see updateSync.ts.
  source: text("source", { enum: ["auto", "manual", "override"] }).notNull().default("manual"),
});

/** Per individual weapon/Arc, not shared across a rank tier — confirmed by the user, costs genuinely differ weapon to weapon in NTE. */
export const equipmentLevelCosts = sqliteTable("equipment_level_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  equipmentItemId: integer("equipment_item_id").notNull(),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  kind: text("kind", { enum: ["material", "exp"] }).notNull().default("material"),
  materialId: integer("material_id"),
  quantity: integer("quantity"),
  expAmount: integer("exp_amount"),
  source: text("source", { enum: ["auto", "manual", "override"] }).notNull().default("manual"),
});

export const skillLevelCosts = sqliteTable("skill_level_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  skillId: integer("skill_id").notNull(),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  materialId: integer("material_id").notNull(),
  quantity: integer("quantity").notNull(),
  source: text("source", { enum: ["auto", "manual", "override"] }).notNull().default("manual"),
});

// ---------------------------------------------------------------------------
// Stage 3 — inventory, income, farm route. User-state, no masterDataColumns,
// same category as Stage 2's tables.
// ---------------------------------------------------------------------------

export const materialInventory = sqliteTable(
  "material_inventory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    materialId: integer("material_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ gameMaterialIdx: uniqueIndex("material_inventory_game_material_idx").on(t.gameId, t.materialId) }),
);

export const currencyInventory = sqliteTable(
  "currency_inventory",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    currencyId: integer("currency_id").notNull(),
    balance: integer("balance").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ gameCurrencyIdx: uniqueIndex("currency_inventory_game_currency_idx").on(t.gameId, t.currencyId) }),
);

/**
 * A recurring (or one-time) source of a currency — cadence/amount are real
 * facts, but `enabled` and `reliabilityPercent` are explicitly the player's
 * own judgment call (which sources they actually have access to, how
 * consistent they've found one to be), so the whole row is user-state, not
 * master data, matching how the original build plan categorized this table.
 */
export const incomeSources = sqliteTable("income_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  name: text("name").notNull(),
  currencyId: integer("currency_id").notNull(),
  // Fixed set, not free text — this is what lets cadence actually drive the
  // projection formula instead of being a display-only label. "custom"
  // covers anything that doesn't fit (patch-length events, etc.):
  // intervalDays is manually set only in that case; for the other five it's
  // derived automatically (see CADENCE_INTERVAL_DAYS on the frontend) and
  // "one-time" always has a null intervalDays (claimed once, never again).
  cadence: text("cadence", { enum: ["daily", "weekly", "bi-weekly", "monthly", "one-time", "custom"] })
    .notNull()
    .default("daily"),
  customCadenceLabel: text("custom_cadence_label"), // display text, only meaningful when cadence === "custom"
  intervalDays: integer("interval_days"), // drives the projection multiplier; null = one-time/unpredictable, excluded from recurring projection
  amountPerEvent: integer("amount_per_event"),
  category: text("category", { enum: ["Guaranteed", "Event-dependent", "Speculative"] })
    .notNull()
    .default("Guaranteed"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  reliabilityPercent: integer("reliability_percent"), // manual/subjective, not computed
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A real, timestamped "I actually got this" event — distinct from
 * `enabled`, which only says "assume this keeps happening" and drives a
 * blind theoretical projection. Claiming credits `currency_inventory`
 * immediately (real balance, not a projection) and lets the Currency tab
 * compute an honest remaining-projection: actual balance + only the
 * periods still ahead in the window, not periods already claimed. One row
 * per claim (append-only ledger, not an upsert) so a claim history exists
 * for whenever an accuracy-tracker feature is worth building on top of it.
 */
export const incomeClaims = sqliteTable("income_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  incomeSourceId: integer("income_source_id").notNull(),
  claimedAt: integer("claimed_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A manual, personal farm-planning to-do list — no farmable-stage catalog,
 * no drop rates, no stamina cost (confirmed pointless: stamina isn't
 * meaningfully tied to specific material stages and is spent on plenty of
 * other things too), no auto-solving. Just an ordered list the player
 * maintains themselves, since farming plans are too personal to auto-solve.
 */
export const farmRouteEntries = sqliteTable("farm_route_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  label: text("label").notNull(), // stage/activity name, free text
  targetLabel: text("target_label"), // what it's for, e.g. "Crimson Filament x3" — free text, not a relation, so non-material targets (currency, "all builds") work too
  forLabel: text("for_label"), // who it's for, e.g. "Zankou · Meiyi" — free text
  plannedRuns: integer("planned_runs").notNull().default(1),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Stage 4 — pull log & pity engine. User-state (no masterDataColumns), same
// category as farm_route_entries. See apps/api/src/core/pityEngine.ts for
// how this feeds the pity/guarantee computation: a row counts as a
// pity-reset purely by having a non-null pityAtPull — the engine never
// needs to know which rank string is "the top rank," so it stays fully
// data-driven and doesn't need games/<slug>/config.ts.
// ---------------------------------------------------------------------------

export const pullLog = sqliteTable("pull_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  bannerId: integer("banner_id").notNull(),
  rank: text("rank"), // denormalized copy of the item's rank at pull time
  itemType: text("item_type", { enum: ["character", "equipment", "other"] })
    .notNull()
    .default("other"),
  itemId: integer("item_id"), // FK into characters/equipmentItems when picked from master data; null for "other"
  itemName: text("item_name").notNull(), // denormalized display name — always set, so the log never needs a join to render
  quantity: integer("quantity").notNull().default(1), // lets one row represent a batch of identical low-rarity pulls (e.g. "x11 B-rank")
  pityAtPull: integer("pity_at_pull"),
  fiftyFiftyResult: text("fifty_fifty_result", { enum: ["won", "lost", "n/a"] }),
  pulledAt: text("pulled_at").notNull(), // ISO date
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Stage 5 — Today dashboard: dailies/weeklies, event progress, redeem codes,
// battle pass. User-state (no masterDataColumns), same category as
// farm_route_entries/income_sources. Stamina and activity-points tracking
// were both cut by the user before this stage was built — see
// docs/progress.md's Stage 5 entry.
// ---------------------------------------------------------------------------

/**
 * One row per checklist item, either from the game (fromGame: true —
 * "GAME DAILIES"/"WEEKLY CLEARS") or user-added (fromGame: false — "MY OWN
 * TASKS", created via the screen 09 "new custom task" dialog). `target`
 * generalizes binary tasks (target 1, a checkbox) and count tasks (target
 * 5, "Hunter's Crucible 3/5", a stepper) under one shape.
 */
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  cadence: text("cadence", { enum: ["daily", "weekly", "once"] }).notNull(),
  label: text("label").notNull(),
  target: integer("target").notNull().default(1),
  rewardKind: text("reward_kind", { enum: ["currency", "material"] }), // null = no reward
  rewardCurrencyId: integer("reward_currency_id"),
  rewardMaterialId: integer("reward_material_id"),
  rewardQuantity: integer("reward_quantity"), // credited PER increment of `current` — see task_progress and routes/tasks.ts
  forLabel: text("for_label"), // free text, e.g. "Zankou" / "all builds" / an event name — same pattern as farm_route_entries.forLabel
  fromGame: integer("from_game", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * One row per (task, reset period) — both the LIVE state for the current
 * period and, once a period rolls over, its own history row. No cron/reset
 * job needed: which periodKey counts as "current" is computed at read time
 * from wall-clock time (see apps/web/src/features/today/taskStats.ts), so a
 * row just stops being current once the date rolls past it. periodKey is
 * "YYYY-MM-DD" for daily/once tasks, "YYYY-Www" (ISO week) for weekly.
 */
export const taskProgress = sqliteTable(
  "task_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    taskId: integer("task_id").notNull(),
    periodKey: text("period_key").notNull(),
    current: integer("current").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ taskPeriodIdx: uniqueIndex("task_progress_task_period_idx").on(t.taskId, t.periodKey) }),
);

/** Per-event user progress ("Events Expiring" needs "9/20 stages" — events master data only has the stage COUNT, not per-player progress. */
export const eventProgress = sqliteTable(
  "event_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    eventId: integer("event_id").notNull(),
    current: integer("current").notNull().default(0),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ eventIdx: uniqueIndex("event_progress_event_idx").on(t.eventId) }),
);

/**
 * A personal running list — add a code you found, mark it redeemed. No
 * source/status provenance (this is "codes I've seen," not a shared
 * catalog fact like master data), no auto-sync (that's Stage 10, same as
 * every other "manual for now" table in this app). rewardLabel is
 * deliberately free text, not a real material/currency relation like task
 * rewards — a code's reward is announced once and redeemed once, not a
 * repeating credit event worth crediting to inventory automatically.
 */
export const redeemCodes = sqliteTable("redeem_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  code: text("code").notNull(),
  rewardLabel: text("reward_label"),
  redeemed: integer("redeemed", { mode: "boolean" }).notNull().default(false),
  // Added Stage 10 — provenance for community-sourced sync (see sync_runs/
  // ingested_update_files below). Defaults to "manual" so every code added
  // before this column existed, and every code you type in by hand, is
  // automatically protected from ever being touched by a sync.
  source: text("source", { enum: ["auto", "manual", "override"] }).notNull().default("manual"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Singleton per game, same shape as game_settings but genuinely user-state
 * (your own live progress, not a config value) — kept as its own table
 * rather than folded into game_settings for that reason.
 */
export const battlePassProgress = sqliteTable(
  "battle_pass_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    currentLevel: integer("current_level").notNull().default(0),
    maxLevel: integer("max_level").notNull().default(50),
    endDate: text("end_date"),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ gameIdx: uniqueIndex("battle_pass_progress_game_idx").on(t.gameId) }),
);

// ---------------------------------------------------------------------------
// Stage 7 — Wishlist & savings rules. User-state (no masterDataColumns).
// Status/attribution are mostly derived at read time (see
// apps/web/src/features/wishlist/wishlistData.ts) — these tables hold only
// what genuinely can't be derived: priority, budget, and the manual
// deferred/locked acknowledgments.
// ---------------------------------------------------------------------------

/**
 * One row per pull target. targetCharacterId/targetEquipmentId mirror
 * banners.featuredCharacterId/featuredEquipmentId's split (never both set).
 * bannerId is nullable — a target can exist before its banner is announced.
 * status is mostly derived (active -> obtained/expired computed at read
 * time from real pull_log/banner data) — only "deferred" (removed while
 * still active) is ever written directly, via the remove-confirm dialog.
 */
export const wishlistTargets = sqliteTable("wishlist_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  targetCharacterId: integer("target_character_id"),
  targetEquipmentId: integer("target_equipment_id"),
  bannerId: integer("banner_id"),
  priority: integer("priority").notNull(),
  copiesWanted: integer("copies_wanted").notNull().default(1),
  budgetCeilingPulls: integer("budget_ceiling_pulls").notNull(),
  reserveFromToday: integer("reserve_from_today", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: ["active", "obtained", "expired", "deferred"] })
    .notNull()
    .default("active"),
  resolvedAt: integer("resolved_at"),
  lockedDecision: text("locked_decision", { enum: ["pull", "hold", "skip"] }),
  lockedAt: integer("locked_at"),
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A fixed set of rule kinds (not a generic condition builder — see
 * docs/progress.md's Stage 7 entry) each evaluated live against real pity
 * and affordability state by wishlistData.ts's evaluateSavingsRules.
 * threshold/scopeBannerType meanings depend on kind:
 *   pulls_floor: threshold = min pulls to keep in reserve
 *   guarantee_only: scopeBannerType = which banner type this applies to (null = all)
 *   reserve_priority: no threshold — always "protect every higher-priority target's reserve"
 *   banner_ending_warn: threshold = days-until-end that triggers the warning
 *   dupe_cap: threshold = max copies before it warns
 *   skip_banner_type: scopeBannerType = the banner type to skip
 */
export const savingsRules = sqliteTable("savings_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  label: text("label").notNull(),
  kind: text("kind", {
    enum: ["pulls_floor", "guarantee_only", "reserve_priority", "banner_ending_warn", "dupe_cap", "skip_banner_type"],
  }).notNull(),
  threshold: integer("threshold"),
  scopeBannerType: text("scope_banner_type"),
  action: text("action", { enum: ["block", "warn", "log"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Accountability log, not a state machine — an override doesn't change the rule, it's a record that a block was proceeded past anyway. */
export const savingsRuleOverrides = sqliteTable("savings_rule_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  ruleId: integer("rule_id").notNull(),
  targetId: integer("target_id"),
  note: text("note"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Stage 9 — real-money spend tracker. The first cross-game feature in the
// app (every table below is still gameId-scoped like everything else; the
// "all games at once" view is assembled client-side by fanning out over
// every configured game, not by anything special here). User-state, no
// masterDataColumns. See docs/progress.md's Stage 9 entry for the scope
// cuts this design reflects (blended $/S-rank, subscriptions doubling as
// income_sources rows, re-scoped guardrails).
// ---------------------------------------------------------------------------

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  purchasedAt: text("purchased_at").notNull(), // ISO date, mirrors pull_log.pulledAt
  label: text("label").notNull(),
  kind: text("kind", { enum: ["top_up", "battle_pass", "subscription_charge", "one_off", "bundle"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  paymentMethod: text("payment_method"), // free text, e.g. "Visa ·6614" — your own label, not billing integration
  isImpulse: integer("is_impulse", { mode: "boolean" }).notNull().default(false), // manual only — never inferred, see docs/progress.md
  notes: text("notes"),
  subscriptionId: integer("subscription_id"), // set when this row is a logged recurring charge against a spend_subscriptions row
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * What a purchase actually granted — a child table, not a single field on
 * `purchases`, because one purchase (a battle pass, most commonly) often
 * grants more than one thing at once, e.g. currency AND a direct pull
 * count. "currency" rows use currencyId/amount as a quantity, pulls =
 * amount / currency.pullCost; "pulls" rows are a direct pull count
 * (bundles that state pulls outright). A purchase with no grants at all
 * (e.g. a subscription charge tracked via its linked income source
 * instead) simply has zero rows here.
 */
export const purchaseGrants = sqliteTable("purchase_grants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: integer("purchase_id").notNull(),
  kind: text("kind", { enum: ["currency", "pulls"] }).notNull(),
  currencyId: integer("currency_id"), // set only when kind = "currency"
  amount: integer("amount").notNull(),
});

/**
 * A recurring real-money commitment. When it grants in-game currency it
 * links to (and, on creation, auto-creates) a real `income_sources` row —
 * claim rate, "unclaimed since X," and the claim button are all the
 * existing Stage 3 machinery, not reinvented here. A subscription that
 * grants a flat pull count instead has nothing to claim, so it stays
 * unlinked.
 */
export const spendSubscriptions = sqliteTable("spend_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  label: text("label").notNull(),
  cadence: text("cadence", { enum: ["daily", "weekly", "bi-weekly", "monthly", "one-time", "custom"] })
    .notNull()
    .default("monthly"),
  customCadenceLabel: text("custom_cadence_label"),
  intervalDays: integer("interval_days"),
  priceCents: integer("price_cents").notNull(),
  linkedIncomeSourceId: integer("linked_income_source_id"),
  status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
  cancelledAt: integer("cancelled_at"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Same shape and same reason as purchase_grants — a subscription (a battle pass, most often) can grant more than one thing per charge. */
export const subscriptionGrants = sqliteTable("subscription_grants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subscriptionId: integer("subscription_id").notNull(),
  kind: text("kind", { enum: ["currency", "pulls"] }).notNull(),
  currencyId: integer("currency_id"),
  amount: integer("amount").notNull(),
});

/**
 * Advisory caps only — this app has no way to authorize or block a real
 * store purchase, the same "rules only advise, nothing stops you in-game"
 * rule wishlist's savings_rules already runs on. gameId null = platform-wide
 * (the one monthly cap that spans every game, and the one single-purchase
 * ceiling — both scoped to the whole account, not any one game).
 */
export const spendBudgets = sqliteTable("spend_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id"),
  kind: text("kind", { enum: ["monthly_cap", "single_purchase_ceiling"] }).notNull(),
  capCents: integer("cap_cents").notNull(),
  action: text("action", { enum: ["block", "warn", "log"] }).notNull().default("warn"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Accountability log, exact mirror of savings_rule_overrides — a record that a breach was proceeded past anyway, not a state change on the budget itself. */
export const spendBudgetOverrides = sqliteTable("spend_budget_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  budgetId: integer("budget_id").notNull(),
  note: text("note"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * One row per game — the two small per-game toggles a store purchase can't
 * be stopped but this app can still warn about (see docs/progress.md), plus
 * the one manual status flag ("quit") a purchase-recency read can't infer
 * on its own — mirrors wishlist_targets' "deferred is the one manual state."
 */
export const spendGameSettings = sqliteTable(
  "spend_game_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: text("game_id").notNull(),
    quitAt: integer("quit_at"),
    warnOnLost5050: integer("warn_on_lost_5050", { mode: "boolean" }).notNull().default(true),
    warnRecentPurchase: integer("warn_recent_purchase", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ gameIdx: uniqueIndex("spend_game_settings_game_idx").on(t.gameId) }),
);

// ---------------------------------------------------------------------------
// Stage 10 — community-sourced update sync. No official/stable feed exists
// for either seeded game (confirmed by research, see docs/progress.md's
// Stage 10 entry) — instead of a connector to a feed that doesn't exist,
// this pulls from a community-editable, PR-reviewed data repo (games/<slug>/
// codes|banners|events/<date>-<slug>.json, one file per update event) that
// you or contributors populate by hand. The provenance-safe upsert this
// drives (apps/api/src/core/updateSync.ts) never touches a manual/override
// row — same guarantee as every other AUTO/MANUAL/OVERRIDE table, just
// reaching redeem_codes for the first time via the new source column above.
// ---------------------------------------------------------------------------

/** Which community-repo file paths a game has already ingested, so a sync never re-applies (or re-fetches) the same update twice. */
export const ingestedUpdateFiles = sqliteTable("ingested_update_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  path: text("path").notNull(), // e.g. "games/neverness-to-everness/codes/2026-09-02-livestream.json"
  ingestedAt: integer("ingested_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Accountability log, same shape/purpose as savings_rule_overrides/spend_budget_overrides — a record of what a sync actually did. */
export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  source: text("source", { enum: ["community", "manual"] }).notNull(),
  createdCount: integer("created_count").notNull(),
  updatedCount: integer("updated_count").notNull(),
  skippedCount: integer("skipped_count").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

/** One row, app-wide — where the community data repo lives. Not per-game: one repo covers every game, each in its own games/<slug>/ folder, same convention this app's own repo already uses for seed data. */
export const syncSettings = sqliteTable("sync_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dataRepoOwner: text("data_repo_owner"),
  dataRepoName: text("data_repo_name"),
});

/**
 * Real reward rows for a redeem code — mirrors event_rewards exactly, same
 * reason (a code often grants more than one thing at once) and same
 * crediting mechanism: apps/api/src/routes/redeemCodes.ts credits every row
 * here via adjustInventory the moment `redeem_codes.redeemed` flips to
 * true, and debits it back symmetrically if un-redeemed — the same
 * real-event-real-credit rule event_rewards already runs on, not a
 * decorative label. See docs/progress.md's Stage 10 follow-up entry for why
 * this exists (redeem codes never had real reward crediting at all, even
 * before Stage 10).
 */
export const codeRewards = sqliteTable("code_rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: text("game_id").notNull(),
  codeId: integer("code_id").notNull(),
  kind: text("kind", { enum: ["currency", "material"] }).notNull(),
  currencyId: integer("currency_id"),
  materialId: integer("material_id"),
  quantity: integer("quantity"),
});
