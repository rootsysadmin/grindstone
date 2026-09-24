import type {
  CharacterBuild,
  CurrencyInventoryRow,
  IncomeClaimRow,
  IncomeSourceRow,
  MaterialInventoryRow,
  SkillLevelEntry,
} from "@grindstone/shared";
import type { CharacterLevelCostRow, EquipmentLevelCostRow, SkillLevelCostRow } from "../master-data/api.ts";

/**
 * Pure client-side math over already-fetched data — same architecture as
 * ../roster/buildProgress.ts. "Remaining need" for character level, weapon
 * level, and skill level is fully derived from the level itself plus a
 * sourced cost schedule, never manually tracked: SUM(quantity) over every
 * band row whose toLevel is still ahead of the current level. See
 * docs/progress.md's Stage 3 entry for why this replaced an earlier
 * flat-manual-need design.
 *
 * EXP-based leveling follow-up: character/equipment cost rows can now be a
 * "material" row (the original shape, still summed by materialId below) or
 * an "exp" row (a flat expAmount, summed separately since it isn't tied to
 * one materialId — see remainingExp/totalExpAvailable). Character-pool and
 * equipment-pool EXP are two separate, non-interchangeable totals, per the
 * user — kept apart throughout rather than merged into one figure.
 */
export interface MaterialNeedLine {
  section: string; // "Character Level" | "Weapon" | a skill's name — structural, not a manual label
  materialId: number;
  quantity: number;
}

export interface ExpNeed {
  character: number;
  equipment: number;
}

function remainingMaterialBands<
  T extends { fromLevel: number; toLevel: number; kind?: string; materialId: number | null; quantity: number | null },
>(rows: T[], currentLevel: number): { materialId: number; quantity: number }[] {
  return rows
    .filter((r) => r.toLevel > currentLevel && r.kind !== "exp" && r.materialId != null && r.quantity != null)
    .map((r) => ({ materialId: r.materialId as number, quantity: r.quantity as number }));
}

function remainingExp<T extends { fromLevel: number; toLevel: number; kind?: string; expAmount?: number | null }>(
  rows: T[],
  currentLevel: number,
): number {
  return rows
    .filter((r) => r.toLevel > currentLevel && r.kind === "exp")
    .reduce((sum, r) => sum + (r.expAmount ?? 0), 0);
}

/** Total EXP available in stock for one pool — a material counts only when its expUsage matches, keeping the character/equipment pools strictly separate (never summed together). */
export function totalExpAvailable(
  materials: { id: number; expValue: number | null; expUsage: string | null }[],
  inventory: MaterialInventoryRow[],
  usage: "character" | "equipment",
): number {
  const haveByMaterial = new Map(inventory.map((i) => [i.materialId, i.quantity]));
  return materials.reduce((sum, m) => {
    if (!m.expValue || m.expUsage !== usage) return sum;
    return sum + (haveByMaterial.get(m.id) ?? 0) * m.expValue;
  }, 0);
}

export function deriveCharacterMaterialNeeds(params: {
  characterId: number;
  build: CharacterBuild | null;
  skillLevels: SkillLevelEntry[];
  characterSkills: { id: number; name: string }[];
  characterLevelCosts: CharacterLevelCostRow[]; // unfiltered — every row for the game
  equipmentLevelCosts: EquipmentLevelCostRow[]; // unfiltered
  skillLevelCosts: SkillLevelCostRow[]; // unfiltered
}): { lines: MaterialNeedLine[]; exp: ExpNeed } {
  const { characterId, build, skillLevels, characterSkills, characterLevelCosts, equipmentLevelCosts, skillLevelCosts } = params;
  if (!build) return { lines: [], exp: { character: 0, equipment: 0 } };
  const lines: MaterialNeedLine[] = [];
  const exp: ExpNeed = { character: 0, equipment: 0 };

  const charCosts = characterLevelCosts.filter((c) => c.characterId === characterId);
  for (const { materialId, quantity } of remainingMaterialBands(charCosts, build.level)) {
    lines.push({ section: "Character Level", materialId, quantity });
  }
  exp.character = remainingExp(charCosts, build.level);

  if (build.equippedEquipmentItemId != null) {
    const eqCosts = equipmentLevelCosts.filter((c) => c.equipmentItemId === build.equippedEquipmentItemId);
    const eqLevel = build.equippedEquipmentLevel ?? 0;
    for (const { materialId, quantity } of remainingMaterialBands(eqCosts, eqLevel)) {
      lines.push({ section: "Weapon", materialId, quantity });
    }
    exp.equipment = remainingExp(eqCosts, eqLevel);
  }

  const levelBySkill = new Map(skillLevels.map((s) => [s.skillId, s.level]));
  for (const skill of characterSkills) {
    const level = levelBySkill.get(skill.id) ?? 0;
    const costs = skillLevelCosts.filter((c) => c.skillId === skill.id);
    for (const { materialId, quantity } of remainingMaterialBands(costs, level)) {
      lines.push({ section: skill.name, materialId, quantity });
    }
  }

  return { lines, exp };
}

/** Groups need lines by section, summing quantity per material within a section (in case a schedule has more than one band still outstanding for the same material). */
export function groupBySection(lines: MaterialNeedLine[]): { section: string; materialId: number; quantity: number }[][] {
  const bySection = new Map<string, Map<number, number>>();
  for (const line of lines) {
    const materials = bySection.get(line.section) ?? new Map<number, number>();
    materials.set(line.materialId, (materials.get(line.materialId) ?? 0) + line.quantity);
    bySection.set(line.section, materials);
  }
  return [...bySection.entries()].map(([section, materials]) =>
    [...materials.entries()].map(([materialId, quantity]) => ({ section, materialId, quantity })),
  );
}

/** Total need per material for one character, across every section. */
export function totalByMaterial(lines: MaterialNeedLine[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const line of lines) totals.set(line.materialId, (totals.get(line.materialId) ?? 0) + line.quantity);
  return totals;
}

export function aggregateTotals(perCharacterTotals: Map<number, number>[]): Map<number, number> {
  const total = new Map<number, number>();
  for (const m of perCharacterTotals) {
    for (const [materialId, qty] of m) total.set(materialId, (total.get(materialId) ?? 0) + qty);
  }
  return total;
}

export interface MaterialRollupRow {
  materialId: number;
  need: number;
  have: number;
  short: number;
  coverage: number; // 0-1
}

export function withInventory(totals: Map<number, number>, inventory: MaterialInventoryRow[]): MaterialRollupRow[] {
  const haveByMaterial = new Map(inventory.map((i) => [i.materialId, i.quantity]));
  return [...totals.entries()].map(([materialId, need]) => {
    const have = haveByMaterial.get(materialId) ?? 0;
    const short = Math.max(0, need - have);
    const coverage = need > 0 ? Math.min(1, have / need) : 1;
    return { materialId, need, have, short, coverage };
  });
}

export interface Bottleneck {
  materialId: number;
  short: number;
  weeklyCap: number;
  resets: number;
}

/** Worst weekly-capped shortfall — a material stays "no matter how much you farm" gated, so it's the binding constraint even if other materials are shorter in absolute terms. */
export function findBottleneck(
  rollup: MaterialRollupRow[],
  materials: { id: number; weeklyCap: number | null }[],
): Bottleneck | null {
  let worst: Bottleneck | null = null;
  for (const row of rollup) {
    if (row.short <= 0) continue;
    const material = materials.find((m) => m.id === row.materialId);
    if (!material?.weeklyCap) continue;
    const resets = Math.ceil(row.short / material.weeklyCap);
    if (!worst || resets > worst.resets) worst = { materialId: row.materialId, short: row.short, weeklyCap: material.weeklyCap, resets };
  }
  return worst;
}

export interface IncomeProjection extends IncomeSourceRow {
  projected: number;
}

/** null intervalDays = one-time/unpredictable, excluded from the recurring projection. */
export function computeIncomeProjection(sources: IncomeSourceRow[], windowDays: number): IncomeProjection[] {
  return sources.map((s) => ({
    ...s,
    projected: s.enabled && s.intervalDays ? (s.amountPerEvent ?? 0) * (windowDays / s.intervalDays) : 0,
  }));
}

export function pullsAvailable(balance: number, pullCost: number | null): number | null {
  if (!pullCost) return null;
  return Math.floor(balance / pullCost);
}

export function currencyBalance(inventory: CurrencyInventoryRow[], currencyId: number): number {
  return inventory.find((c) => c.currencyId === currencyId)?.balance ?? 0;
}

/** Fixed cadences that drive intervalDays automatically — "custom" and "one-time" are set explicitly instead (see IncomeSourcesTab.tsx). */
export const CADENCE_INTERVAL_DAYS: Record<"daily" | "weekly" | "bi-weekly" | "monthly", number> = {
  daily: 1,
  weekly: 7,
  "bi-weekly": 14,
  monthly: 30,
};

/**
 * Whether a source has a real, logged claim covering "now" — one-time
 * sources are done forever once claimed at all; recurring ones are
 * "claimed" if the most recent claim falls within the current interval.
 * This is what makes the claim button show CLAIMED and stops the
 * remaining-projection from double-counting a period you've already
 * gotten credit for.
 */
export function isClaimedThisPeriod(source: IncomeSourceRow, claims: IncomeClaimRow[]): boolean {
  const sourceClaims = claims.filter((c) => c.incomeSourceId === source.id);
  if (sourceClaims.length === 0) return false;
  if (source.cadence === "one-time") return true;
  if (!source.intervalDays) return false;
  const lastClaimedAt = Math.max(...sourceClaims.map((c) => c.claimedAt));
  const nowSeconds = Date.now() / 1000;
  return nowSeconds - lastClaimedAt < source.intervalDays * 86400;
}

/**
 * The honest remaining projection for the Currency tab: actual balance
 * already reflects whatever's been claimed, so this only counts periods
 * still ahead in the window — not a blind cadence x amount multiply. A
 * one-time source that's already been claimed contributes nothing further,
 * ever; an unclaimed one still contributes its full amount once.
 */
export function computeRemainingProjection(source: IncomeSourceRow, claims: IncomeClaimRow[], windowDays: number): number {
  if (!source.enabled) return 0;
  const amount = source.amountPerEvent ?? 0;
  if (source.cadence === "one-time") {
    return isClaimedThisPeriod(source, claims) ? 0 : amount;
  }
  if (!source.intervalDays) return 0;
  const periodsInWindow = Math.floor(windowDays / source.intervalDays);
  const alreadyCovered = isClaimedThisPeriod(source, claims) ? 1 : 0;
  return Math.max(0, periodsInWindow - alreadyCovered) * amount;
}
