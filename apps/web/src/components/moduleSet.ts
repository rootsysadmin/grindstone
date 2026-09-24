import type { MasterDataRow } from "@grindstone/shared";
import type { ModuleTargetRow } from "../features/master-data/api.ts";

/**
 * A character's "Set" (1 Cartridge + their maxAugmentSlots Modules) isn't
 * a stored construct — it's every moduleTargets row already scoped to them
 * via forCharacterId, split by the parent module's pieceType. See the doc
 * comment on `moduleTargets` in apps/api/src/db/schema.ts. Cross-feature
 * (roster + planner), so it lives in components/, not either feature folder.
 */
export interface CharacterModuleSet {
  cartridge: ModuleTargetRow[];
  modules: ModuleTargetRow[];
}

export function isAchieved(target: ModuleTargetRow): boolean {
  return target.achievedAt != null;
}

export function achievedCount(targets: ModuleTargetRow[]): number {
  return targets.filter(isAchieved).length;
}

export function getCharacterModuleSet(
  targets: ModuleTargetRow[],
  modules: MasterDataRow[],
  characterId: number,
): CharacterModuleSet {
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const scoped = targets.filter((t) => t.forCharacterId === characterId);
  const cartridge = scoped.filter((t) => moduleById.get(t.moduleId)?.pieceType === "Cartridge");
  const moduleTargetRows = scoped.filter((t) => moduleById.get(t.moduleId)?.pieceType !== "Cartridge");
  return { cartridge, modules: moduleTargetRows };
}
