// Stage 7 — Wishlist & savings rules API shapes. Same category as
// today.ts/planner.ts: plain interfaces, not entityConfigs-driven, since
// none of these are master-data catalog rows. Most of a target's live
// state (obtained/expired, affordability) is derived client-side in
// apps/web/src/features/wishlist/wishlistData.ts, not stored here.

export type WishlistTargetStatus = "active" | "obtained" | "expired" | "deferred";
export type LockedDecision = "pull" | "hold" | "skip";

export interface WishlistTargetRow {
  id: number;
  targetCharacterId: number | null;
  targetEquipmentId: number | null;
  bannerId: number | null;
  priority: number;
  copiesWanted: number;
  budgetCeilingPulls: number;
  reserveFromToday: boolean;
  status: WishlistTargetStatus;
  resolvedAt: number | null;
  lockedDecision: LockedDecision | null;
  lockedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export type SavingsRuleKind = "pulls_floor" | "guarantee_only" | "reserve_priority" | "banner_ending_warn" | "dupe_cap" | "skip_banner_type";
export type SavingsRuleAction = "block" | "warn" | "log";

export interface SavingsRuleRow {
  id: number;
  label: string;
  kind: SavingsRuleKind;
  threshold: number | null;
  scopeBannerType: string | null;
  action: SavingsRuleAction;
  enabled: boolean;
  sortOrder: number;
}

export interface SavingsRuleOverrideRow {
  id: number;
  ruleId: number;
  targetId: number | null;
  note: string | null;
  createdAt: number;
}
