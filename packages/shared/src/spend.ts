// Stage 9 — real-money spend tracker API shapes. Unlike every other feature
// here, Spend is cross-game — the web layer fans out over every configured
// game and merges client-side (see apps/web/src/features/spend/api.ts's
// useAllGamesSpend), so every row type below carries its own gameId rather
// than relying on an implicit "current active game" the way e.g.
// WishlistTargetRow does.

export type PurchaseKind = "top_up" | "battle_pass" | "subscription_charge" | "one_off" | "bundle";
export type GrantKind = "currency" | "pulls";

/** One thing a purchase or subscription granted. A single purchase can have several of these — most commonly a battle pass that grants both currency and a direct pull count. */
export interface GrantRow {
  id: number;
  kind: GrantKind;
  currencyId: number | null; // set only when kind = "currency"
  amount: number;
}

export interface PurchaseRow {
  id: number;
  gameId: string;
  purchasedAt: string;
  label: string;
  kind: PurchaseKind;
  amountCents: number;
  paymentMethod: string | null;
  grants: GrantRow[];
  isImpulse: boolean;
  notes: string | null;
  subscriptionId: number | null;
  createdAt: number;
}

export type SpendSubscriptionCadence = "daily" | "weekly" | "bi-weekly" | "monthly" | "one-time" | "custom";
export type SpendSubscriptionStatus = "active" | "cancelled";

export interface SpendSubscriptionRow {
  id: number;
  gameId: string;
  label: string;
  cadence: SpendSubscriptionCadence;
  customCadenceLabel: string | null;
  intervalDays: number | null;
  priceCents: number;
  grants: GrantRow[];
  linkedIncomeSourceId: number | null;
  status: SpendSubscriptionStatus;
  cancelledAt: number | null;
  createdAt: number;
}

export type SpendBudgetKind = "monthly_cap" | "single_purchase_ceiling";
export type SpendBudgetAction = "block" | "warn" | "log";

export interface SpendBudgetRow {
  id: number;
  gameId: string | null; // null = platform-wide
  kind: SpendBudgetKind;
  capCents: number;
  action: SpendBudgetAction;
  enabled: boolean;
  createdAt: number;
}

export interface SpendBudgetOverrideRow {
  id: number;
  gameId: string;
  budgetId: number;
  note: string | null;
  createdAt: number;
}

export interface SpendGameSettingsRow {
  gameId: string;
  quitAt: number | null;
  warnOnLost5050: boolean;
  warnRecentPurchase: boolean;
}
