export type FieldType = "text" | "textarea" | "number" | "boolean" | "date" | "select" | "relation" | "color";

export interface FieldConfig {
  key: string;
  /** May contain {term:xyz} placeholders resolved against a game's terms map — see interpolateLabel. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** For type "select": fixed choices. */
  options?: readonly string[];
  /** For type "select" with game-specific choices, e.g. elements — resolved client-side against game config. */
  optionsFrom?: "elements" | "equipmentTypes" | "augmentPieceTypes" | "augmentShapes";
  /** For type "relation": which entity this FK points at. */
  relationEntity?: EntityKey;
  /** Show in the table's column list (defaults true). Some fields are edit-only. */
  inTable?: boolean;
}

export type EntityKey =
  | "characters"
  | "equipmentItems"
  | "materials"
  | "skills"
  | "modules"
  | "elements"
  | "rankTiers"
  | "currencies"
  | "banners"
  | "events";

export interface EntityConfig {
  key: EntityKey;
  apiPath: string;
  label: string;
  labelPlural: string;
  hasImage: boolean;
  fields: FieldConfig[];
  /** Skills are edited as child rows of a character, not their own top-level tab. */
  childOf?: EntityKey;
  childForeignKey?: string;
}

const masterDataMeta: FieldConfig[] = [
  { key: "name", label: "Name", type: "text", required: true },
];

export const entityConfigs: Record<EntityKey, EntityConfig> = {
  characters: {
    key: "characters",
    apiPath: "characters",
    label: "Character",
    labelPlural: "Characters",
    hasImage: true,
    fields: [
      ...masterDataMeta,
      { key: "rankTierId", label: "Rank", type: "relation", relationEntity: "rankTiers", required: true },
      { key: "elementId", label: "Element", type: "relation", relationEntity: "elements", required: true },
      { key: "role", label: "Role", type: "text" },
      { key: "releaseDate", label: "Release", type: "date" },
      { key: "ascensionMaterialId", label: "Ascension material", type: "relation", relationEntity: "materials" },
      { key: "maxAugmentSlots", label: "{term:augment} slots", type: "number" },
    ],
  },
  equipmentItems: {
    key: "equipmentItems",
    apiPath: "equipment-items",
    label: "{term:equipmentItem}",
    labelPlural: "{term:equipmentItemPlural}",
    hasImage: true,
    fields: [
      ...masterDataMeta,
      { key: "rankTierId", label: "Rank", type: "relation", relationEntity: "rankTiers", required: true },
      { key: "type", label: "Type", type: "select", optionsFrom: "equipmentTypes" },
      { key: "mainStat", label: "Main stat", type: "text" },
      { key: "passiveText", label: "Passive", type: "textarea" },
    ],
  },
  materials: {
    key: "materials",
    apiPath: "materials",
    label: "Material",
    labelPlural: "Materials",
    hasImage: true,
    fields: [
      ...masterDataMeta,
      { key: "rankTierId", label: "Rank", type: "relation", relationEntity: "rankTiers" },
      // Descriptive only — nothing reads this to decide what a material is
      // "for". A material can (and often does) serve as both a character's
      // ascension material and a skill's upgrade material at once; that's
      // already possible today via the independent relations on Characters
      // and Skills, not gated by this label in any way.
      { key: "category", label: "Category", type: "text" },
      { key: "weeklyCap", label: "Weekly cap", type: "number" },
      // EXP-material pair: expValue marks this as a fungible EXP source
      // (any combination totaling the required amount works, unlike
      // ascension materials). expUsage scopes which of the two
      // non-interchangeable pools it belongs to — character-leveling EXP
      // mats and weapon-leveling EXP mats are never shared, per the user.
      { key: "expValue", label: "EXP value", type: "number" },
      { key: "expUsage", label: "EXP usage", type: "select", options: ["character", "equipment"] },
      { key: "craftsIntoId", label: "Crafts into", type: "relation", relationEntity: "materials" },
      // A substitute that can cover a shortfall of this material on the
      // planner — shown as an informational hint only (no conversion ratio
      // is tracked), distinct from craftsIntoId's "upgrades into" relation.
      { key: "alternativeMaterialId", label: "Alternative", type: "relation", relationEntity: "materials" },
      // No "drops from" field — a material can have several sources, which
      // would make a single text value misleading for anything that reads
      // it as a farm-route identifier. See materialSources (child rows,
      // edited from the record editor) in apps/api/src/db/schema.ts.
    ],
  },
  skills: {
    key: "skills",
    apiPath: "skills",
    label: "Skill",
    labelPlural: "Skills",
    hasImage: false,
    // Skills get their own master-data tab (flat list, "owner" column) AND are
    // edited as child rows inside a character's record editor — both views
    // hit the same /api/games/:game/skills endpoints.
    childOf: "characters",
    childForeignKey: "characterId",
    // Deliberately minimal: the tracker assumes a build target is always
    // max level, so scaling stat / effect text aren't tracked — only enough
    // to identify the skill and know what it costs to max. Upgrade
    // materials/quantities live in skillLevelCosts, per level band, not a
    // field here.
    fields: [
      ...masterDataMeta,
      { key: "characterId", label: "Owner", type: "relation", relationEntity: "characters", required: true },
      { key: "slot", label: "Slot", type: "text", required: true },
      // Optional — most skills share the game's flat maxSkillLevel; this
      // overrides it for the edge case where one doesn't. Leave blank to
      // use the game default.
      { key: "maxLevel", label: "Max level (override)", type: "number" },
    ],
  },
  modules: {
    key: "modules",
    apiPath: "modules",
    label: "{term:augment}",
    labelPlural: "{term:augmentPlural}",
    hasImage: true,
    // Covers both halves of the Console gear system, split by pieceType:
    // Cartridge (one equipped; mainStat here isn't meaningful since the
    // real main stat is RNG-rolled per pull — see moduleTargets/
    // ownedAugments) and Module (a fixed shape via `slot`). No set-bonus
    // tracking (dropped — see apps/api/src/db/schema.ts). A character's
    // "Set" is built from moduleTargets scoped to them via forCharacterId,
    // not from anything on this table.
    fields: [
      ...masterDataMeta,
      { key: "pieceType", label: "Piece type", type: "select", optionsFrom: "augmentPieceTypes", required: true },
      { key: "slot", label: "{term:augmentShapeLabel}", type: "select", optionsFrom: "augmentShapes" },
      { key: "mainStat", label: "Main stat", type: "text" },
      { key: "maxLevel", label: "Max level", type: "number" },
    ],
  },
  elements: {
    key: "elements",
    apiPath: "elements",
    label: "Element",
    labelPlural: "Elements",
    hasImage: true,
    fields: [
      ...masterDataMeta,
      { key: "colour", label: "Colour", type: "text" },
      { key: "shortCode", label: "Short code", type: "text" },
    ],
  },
  rankTiers: {
    key: "rankTiers",
    apiPath: "rank-tiers",
    label: "Rank tier",
    labelPlural: "Rank tiers",
    hasImage: false,
    fields: [
      ...masterDataMeta,
      // Ascending = stronger (1 = weakest) — drives both display order and
      // the Rank column's sort on every entity that references this table,
      // not just a display number. Freely configurable per game: different
      // games use different tier counts (NTE: 3, Wuthering Waves: 2,
      // others seen with 5+), so there's no fixed universal scale here.
      { key: "level", label: "Level", type: "number", required: true },
      { key: "color", label: "Color", type: "color", required: true },
    ],
  },
  currencies: {
    key: "currencies",
    apiPath: "currencies",
    label: "Currency",
    labelPlural: "Currencies",
    hasImage: true,
    // Master data only — how much of a currency a player holds is
    // user-state (a future inventory/ledger feature), not tracked here.
    // No cap field: unlike materials' weeklyCap, currencies don't have a
    // meaningful universal notion of a cap. Event-scoped/expiring
    // currencies aren't modeled either — out of scope for now.
    fields: [
      ...masterDataMeta,
      { key: "rankTierId", label: "Rank", type: "relation", relationEntity: "rankTiers" },
      { key: "category", label: "Category", type: "text" },
      { key: "shortCode", label: "Short code", type: "text" },
      { key: "pullCost", label: "Pull cost", type: "number" },
      { key: "convertsToId", label: "Converts to", type: "relation", relationEntity: "currencies" },
      { key: "conversionRate", label: "Conversion rate", type: "text" },
      { key: "spendsOn", label: "Spends on", type: "text" },
    ],
  },
  banners: {
    key: "banners",
    apiPath: "banners",
    label: "Banner",
    labelPlural: "Banners",
    hasImage: true,
    fields: [
      ...masterDataMeta,
      { key: "type", label: "Type", type: "text", required: true },
      { key: "featuredCharacterId", label: "Featured character", type: "relation", relationEntity: "characters" },
      {
        key: "featuredEquipmentId",
        label: "Featured {term:equipmentItem}",
        type: "relation",
        relationEntity: "equipmentItems",
      },
      { key: "startDate", label: "Start", type: "date", required: true },
      { key: "endDate", label: "End", type: "date", required: true },
      { key: "pity", label: "Pity", type: "number" },
      { key: "softPity", label: "Soft pity", type: "number" },
      { key: "fiftyFifty", label: "50/50", type: "boolean" },
      { key: "carriesPity", label: "Carries pity", type: "boolean" },
    ],
  },
  events: {
    key: "events",
    apiPath: "events",
    label: "Event",
    labelPlural: "Events",
    hasImage: false,
    // No currencyReward/materialRewards fields — an event's rewards are
    // usually a mix of several currencies and materials, so they're child
    // rows (eventRewards) edited from the record editor instead of two
    // flat fields that could only ever hold one value each.
    fields: [
      ...masterDataMeta,
      { key: "kind", label: "Kind", type: "text" },
      { key: "startDate", label: "Start", type: "date", required: true },
      { key: "endDate", label: "End", type: "date", required: true },
      { key: "stageCount", label: "Stages", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
};

// Matches the mockup's master-data tab order (screens 10, 24-30). This is
// display order only — NOT safe to insert/import rows in this order, since
// e.g. characters (index 0) has a foreign key to elements (index 5). Use
// entityDependencyOrder for anything that writes rows.
export const topLevelEntityOrder: EntityKey[] = [
  "characters",
  "equipmentItems",
  "materials",
  "skills",
  "modules",
  "elements",
  "rankTiers",
  "currencies",
  "banners",
  "events",
];

/**
 * Topological sort of entities by their "relation" fields, so an entity
 * always comes after everything it has a foreign key to (self-references
 * excluded — those need the target row to already exist, which a single
 * import pass can't guarantee, so they're resolved best-effort instead).
 * Computed from entityConfigs rather than hand-maintained, so it can't
 * silently drift out of sync if a relation field is added or changed —
 * used by the seed loader and the full-game export/import.
 */
export const entityDependencyOrder: EntityKey[] = (() => {
  const keys = Object.keys(entityConfigs) as EntityKey[];
  const deps = new Map<EntityKey, Set<EntityKey>>();
  for (const key of keys) {
    const set = new Set<EntityKey>();
    for (const f of entityConfigs[key].fields) {
      if (f.type === "relation" && f.relationEntity && f.relationEntity !== key) {
        set.add(f.relationEntity);
      }
    }
    deps.set(key, set);
  }
  const ordered: EntityKey[] = [];
  const visited = new Set<EntityKey>();
  function visit(key: EntityKey, stack: Set<EntityKey>) {
    if (visited.has(key)) return;
    if (stack.has(key)) throw new Error(`Circular master-data dependency involving "${key}"`);
    stack.add(key);
    for (const dep of deps.get(key) ?? []) visit(dep, stack);
    stack.delete(key);
    visited.add(key);
    ordered.push(key);
  }
  for (const key of keys) visit(key, new Set());
  return ordered;
})();

/** Resolves {term:xyz} placeholders in a label against a game's terms map. */
export function interpolateLabel(label: string, terms: Record<string, string>): string {
  return label.replace(/\{term:(\w+)\}/g, (_, key) => terms[key] ?? key);
}

export interface MasterDataRow {
  id: number;
  gameId: string;
  slug: string;
  name: string;
  source: "auto" | "manual" | "override";
  status: "draft" | "published";
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
  [key: string]: unknown;
}
