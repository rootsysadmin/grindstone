// Stage 3 — inventory/currency/farm-route/income API shapes, plus the
// level-band material cost schedules. Same category as roster.ts: plain
// interfaces, not entityConfigs-driven, since none of these are master-data
// catalog rows in the source/status/draft-publish sense — the cost-schedule
// rows are real game facts (sourced once, shared by every player) but don't
// carry that provenance system either, same as module_targets.

/** A level-band cost row: reaching `toLevel` from `fromLevel` costs `quantity` of `materialId`. Same shape for character/equipment (wide bands, e.g. 1->20) and skills (bands of size 1) — see materialNeeds.ts for the shared "remaining need" math. */
export interface LevelCostRow {
  id: number;
  fromLevel: number;
  toLevel: number;
  materialId: number;
  quantity: number;
}

export interface CharacterLevelCostRow extends LevelCostRow {
  characterId: number;
}

export interface EquipmentLevelCostRow extends LevelCostRow {
  equipmentItemId: number;
}

export interface SkillLevelCostRow extends LevelCostRow {
  skillId: number;
}

export interface MaterialInventoryRow {
  id: number;
  materialId: number;
  quantity: number;
  updatedAt: number;
}

export interface CurrencyInventoryRow {
  id: number;
  currencyId: number;
  balance: number;
  updatedAt: number;
}

export interface InventoryResponse {
  materials: MaterialInventoryRow[];
  currencies: CurrencyInventoryRow[];
}

export type IncomeSourceCategory = "Guaranteed" | "Event-dependent" | "Speculative";

/** Fixed set so cadence can drive the projection formula directly — "custom" is the only one with a manually-set intervalDays. */
export type IncomeCadence = "daily" | "weekly" | "bi-weekly" | "monthly" | "one-time" | "custom";

export interface IncomeSourceRow {
  id: number;
  name: string;
  currencyId: number;
  cadence: IncomeCadence;
  customCadenceLabel: string | null;
  intervalDays: number | null;
  amountPerEvent: number | null;
  category: IncomeSourceCategory;
  enabled: boolean;
  reliabilityPercent: number | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/** One real "I actually got this" event — see schema.ts's comment on income_claims for why this is separate from the `enabled` toggle. */
export interface IncomeClaimRow {
  id: number;
  incomeSourceId: number;
  claimedAt: number;
}

export interface FarmRouteEntryRow {
  id: number;
  label: string;
  targetLabel: string | null;
  forLabel: string | null;
  plannedRuns: number;
  done: boolean;
  sortOrder: number;
  notes: string | null;
  createdAt: number;
}
