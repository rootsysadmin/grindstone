// Terminology and identity for this game. apps/* code must never hardcode
// these strings directly — read them through this config so the generic
// schema (character, equipment_item, resonance_level, ...) stays reusable
// across games. See games/_template/ and docs/adding-a-game.md.
//
// This game was added specifically to pressure-test how game-agnostic the
// shared schema/config actually is (see docs/progress.md's "Stage 1
// follow-up — adding Wuthering Waves" entry for what that test found).
// Sourced via web research — see progress.md for citations and the two
// real schema-fit gaps the research surfaced.
// Not typed against @grindstone/shared's GameConfig here — this file sits
// outside apps/web's TS program root and can't resolve workspace package
// imports from here (module resolution walks up from this file's own
// location). The shape is enforced instead where it's actually consumed:
// apps/web/src/features/master-data/gameConfigRegistry.ts's
// Record<string, GameConfig> assignment.
export const gameConfig = {
  slug: "wuthering-waves",
  displayName: "Wuthering Waves",
  brandName: "WuWa",
  terms: {
    equipmentItem: "Weapon",
    equipmentItemPlural: "Weapons",
    augment: "Echo",
    augmentPlural: "Echoes",
    resonanceLevel: "Resonance Chain",
    resonanceLevelPlural: "Resonance Chains",
    augmentShapeLabel: "Echo Cost",
  },
  // Currencies are master data now (seed/currencies.json), not static
  // config — see docs/progress.md's "Currencies become master data" entry.
  // Ranks are master data too now (seed/rank-tiers.json), not static
  // config — see docs/progress.md's rank-tiers entry.
  elements: ["Aero", "Electro", "Fusion", "Glacio", "Havoc", "Spectro"] as const,
  equipmentTypes: ["Sword", "Broadblade", "Pistols", "Gauntlets", "Rectifier"] as const,
  // No maxResonanceLevel/maxCharacterLevel/maxSkillLevel/maxEquipmentLevel
  // here — those are runtime-editable GameSettings now, seeded from
  // seed/game-settings.json (90/10/90/6) and editable via
  // GET/PATCH /api/games/:game/settings without a rebuild. See
  // packages/shared/src/gameSettings.ts and progress.md for sourcing.
  // The Echo system: 5 slots, each an Echo with a Cost (1/2/3/4, not a named
  // "slot") that sums to a 12-cost budget per build — the budget itself
  // isn't enforced by this schema (see progress.md). The cost-4 slot is the
  // one that carries an equippable Echo Skill — the closest real analog to
  // NTE's "one main piece" split, though the official system is really 4
  // named cost-classes (Common/Elite/Overload/Calamity), not a clean binary.
  // Approximated to a binary pieceType here since that's what the shared
  // schema's `modules` table supports — see progress.md.
  augmentPieceTypes: ["Main Echo", "Sub Echo"] as const,
  augmentShapes: ["1", "2", "3", "4"] as const,
} as const;
