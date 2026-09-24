/**
 * Per-game numeric progression ceilings — real, runtime-editable data
 * (`GET`/`PATCH /api/games/:game/settings`), not static GameConfig, since
 * a game's own level caps can rise with a patch and shouldn't require a
 * source change + rebuild to update. See apps/api/src/db/schema.ts's
 * `gameSettings` table.
 */
export interface GameSettings {
  maxCharacterLevel: number;
  maxSkillLevel: number;
  maxEquipmentLevel: number;
  maxResonanceLevel: number;
}
