/**
 * Shape every games/<slug>/config.ts must satisfy. Field names here are
 * deliberately generic (equipmentTypes, not "arcTypes"; maxResonanceLevel,
 * not "maxAwakeningLevel") — a game's own vocabulary belongs in `terms`
 * and in the values of these arrays, never in the field names themselves.
 * See root CLAUDE.md's "the one rule that matters most".
 */
export interface GameConfig {
  slug: string;
  displayName: string;
  brandName: string;
  /** Display-name overrides for generic entities/concepts, e.g. equipmentItem -> "Arc". Resolved via {term:xyz} placeholders — see interpolateLabel. */
  terms: Record<string, string>;
  elements: readonly string[];
  /** Equipment-item (weapon) categories. */
  equipmentTypes: readonly string[];
  // No maxResonanceLevel/maxCharacterLevel/maxSkillLevel/maxEquipmentLevel
  // here — those are runtime-editable GameSettings now (a DB row, not
  // static config), since a game's own level caps can rise with a patch.
  // See packages/shared/src/gameSettings.ts.
  /**
   * The augment/relic system's piece kinds, e.g. NTE's ["Cartridge","Module"]
   * (one main piece + several set pieces) or a single-kind list if a game
   * has no such split.
   */
  augmentPieceTypes: readonly string[];
  /** The fixed "shape"/slot-type values a set-forming augment piece can have. */
  augmentShapes: readonly string[];
}
