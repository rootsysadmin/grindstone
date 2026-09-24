// Terminology and identity for this game. apps/* code must never hardcode
// these strings directly — read them through this config so the generic
// schema (character, equipment_item, resonance_level, ...) stays reusable
// for other games. See games/_template/ and docs/adding-a-game.md.
//
// Sourced against the real game (see progress.md for citations) — not
// invented for the mockup. A few terms the mockup got right by luck
// (Arc, Console Module, Annulith) and a couple it got wrong (character
// dupe/rank-up is "Awakening", not "Sigil"; there are 6 elements, not 5)
// are corrected here.
// Not typed against @grindstone/shared's GameConfig here — this file sits
// outside apps/web's TS program root and can't resolve workspace package
// imports from here (module resolution walks up from this file's own
// location). The shape is enforced instead where it's actually consumed:
// apps/web/src/features/master-data/gameConfigRegistry.ts's
// Record<string, GameConfig> assignment.
export const gameConfig = {
  slug: "neverness-to-everness",
  displayName: "Neverness to Everness",
  brandName: "NTE",
  terms: {
    equipmentItem: "Arc",
    equipmentItemPlural: "Arcs",
    augment: "Module",
    augmentPlural: "Modules",
    resonanceLevel: "Awakening",
    resonanceLevelPlural: "Awakenings",
    augmentShapeLabel: "Slot (shape)",
  },
  // Currencies are master data now (seed/currencies.json), not static
  // config — see docs/progress.md's "Currencies become master data" entry.
  // Ranks are master data too now (seed/rank-tiers.json), not static
  // config — see docs/progress.md's rank-tiers entry.
  elements: ["Cosmos", "Anima", "Incantation", "Psyche", "Lakshana", "Chaos"] as const,
  equipmentTypes: ["Solid", "Liquid", "Gas", "Plasma", "Synthesis"] as const,
  // No maxResonanceLevel/maxCharacterLevel/maxSkillLevel/maxEquipmentLevel
  // here — those are runtime-editable GameSettings now, seeded from
  // seed/game-settings.json (80/10/80/6) and editable via
  // GET/PATCH /api/games/:game/settings without a rebuild. See
  // packages/shared/src/gameSettings.ts and progress.md for sourcing.
  // The Console gear system: a character equips exactly one Cartridge
  // (no set bonus — only one is ever worn) plus several Modules, each a
  // fixed shape identified by its slot type.
  augmentPieceTypes: ["Cartridge", "Module"] as const,
  augmentShapes: ["2", "3", "4"] as const,
} as const;
