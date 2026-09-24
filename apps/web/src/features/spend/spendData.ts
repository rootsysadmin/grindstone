import type { GrantRow, IncomeClaimRow, IncomeSourceRow, MasterDataRow, PurchaseRow, SpendSubscriptionRow } from "@grindstone/shared";
import type { GameSpendData } from "./api.ts";

/**
 * Pure client-side math over already-fetched data — same architecture as
 * wishlistData.ts/calendarData.ts. The one new wrinkle: every function here
 * takes data for potentially several games at once (see api.ts's
 * useAllGamesSpend), since Spend is the app's first cross-game feature.
 */

// --- shared helpers ----------------------------------------------------

/**
 * How many pulls a purchase or subscription's grants are worth in total. A
 * single purchase can carry several grants (most commonly a battle pass
 * granting both currency and a direct pull count) — this sums whatever's
 * derivable across all of them. Currency grants derive via that currency's
 * real pullCost (contributing 0 if it has none, never guessed); direct pull
 * grants are already a pull count.
 */
export function pullsFromGrants(grants: GrantRow[], currencies: MasterDataRow[]): number {
  return grants.reduce((total, g) => {
    if (g.kind === "pulls") return total + g.amount;
    const pullCost = currencies.find((c) => c.id === g.currencyId)?.pullCost as number | null | undefined;
    return total + (pullCost ? Math.floor(g.amount / pullCost) : 0);
  }, 0);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "2026-09"
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// --- per-game summary (Overview's BY GAME table, Value's cost-per-S-rank) --

export type GameSpendStatus =
  | { kind: "active" }
  | { kind: "inactive"; sinceMonth: string }
  | { kind: "quit"; sinceMonth: string }
  | { kind: "no-spend" };

export interface GameSpendSummary {
  gameId: string;
  displayName: string;
  lifetimeCents: number;
  thisMonthCents: number;
  pullsFunded: number;
  dollarsPerPull: number | null;
  sRanks: number;
  dollarsPerSRank: number | null; // blended — total $ / total S-ranks ever, not paid-pulls-only (see docs/progress.md)
  status: GameSpendStatus;
}

const ACTIVE_WINDOW_DAYS = 45;

export function computeGameSpendSummary(game: GameSpendData, now: Date = new Date()): GameSpendSummary {
  const { config, purchases, subscriptions, pullLog, currencies, settings, topRankName } = game;
  const lifetimeCents = purchases.reduce((a, p) => a + p.amountCents, 0);
  const nowMonth = monthKey(now.toISOString());
  const thisMonthCents = purchases.filter((p) => monthKey(p.purchasedAt) === nowMonth).reduce((a, p) => a + p.amountCents, 0);

  const pullsFunded = purchases.reduce((a, p) => a + pullsFromGrants(p.grants, currencies), 0);
  const dollarsPerPull = pullsFunded > 0 ? centsToDollars(lifetimeCents) / pullsFunded : null;

  const sRanks = pullLog.filter((p) => p.rank === topRankName).reduce((a, p) => a + p.quantity, 0);
  const dollarsPerSRank = sRanks > 0 ? centsToDollars(lifetimeCents) / sRanks : null;

  let status: GameSpendStatus;
  if (settings.quitAt) {
    status = { kind: "quit", sinceMonth: monthLabel(new Date(settings.quitAt * 1000).toISOString().slice(0, 7)) };
  } else {
    const hasActiveSub = subscriptions.some((s) => s.status === "active");
    const lastPurchase = purchases.length > 0 ? purchases.reduce((a, p) => (p.purchasedAt > a ? p.purchasedAt : a), purchases[0]!.purchasedAt) : null;
    const daysSinceLast = lastPurchase ? (now.getTime() - new Date(lastPurchase).getTime()) / 86400000 : Infinity;
    if (hasActiveSub || daysSinceLast <= ACTIVE_WINDOW_DAYS) status = { kind: "active" };
    else if (lastPurchase) status = { kind: "inactive", sinceMonth: monthLabel(monthKey(lastPurchase)) };
    else status = { kind: "no-spend" };
  }

  return { gameId: config.slug, displayName: config.displayName, lifetimeCents, thisMonthCents, pullsFunded, dollarsPerPull, sRanks, dollarsPerSRank, status };
}

// --- monthly series (Overview chart, Budget's "cap vs actual" reuse) ------

export interface MonthlySpendPoint {
  monthKey: string;
  label: string;
  byGame: Record<string, number>; // cents, keyed by gameId
  totalCents: number;
}

export function computeMonthlySpendSeries(games: GameSpendData[], months: number, now: Date = new Date()): MonthlySpendPoint[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys.map((key) => {
    const byGame: Record<string, number> = {};
    for (const g of games) {
      byGame[g.config.slug] = g.purchases.filter((p) => monthKey(p.purchasedAt) === key).reduce((a, p) => a + p.amountCents, 0);
    }
    const totalCents = Object.values(byGame).reduce((a, c) => a + c, 0);
    return { monthKey: key, label: monthLabel(key), byGame, totalCents };
  });
}

// --- subscriptions (screen 34) ---------------------------------------------

export type SubscriptionVerdict = "keep" | "review" | "cancel";

export interface SubscriptionSummary {
  subscription: SpendSubscriptionRow;
  claimRatePercent: number | null; // null if there's nothing claimable to rate (no currency grant or no linked source)
  paidSoFarCents: number;
  pullsGranted: number;
  dollarsPerPull: number | null;
  renewsInDays: number | null; // derived from the most recent linked charge + intervalDays, not stored
  verdict: SubscriptionVerdict;
}

/** Elapsed cadence periods since the subscription started vs. periods with a real claim — extends isClaimedThisPeriod's single-period check across the sub's whole history. */
function claimRateForSubscription(sub: SpendSubscriptionRow, linkedSource: IncomeSourceRow | null, claims: IncomeClaimRow[], now: Date): number | null {
  if (!linkedSource || !sub.intervalDays) return null;
  const sourceClaims = claims.filter((c) => c.incomeSourceId === linkedSource.id).map((c) => c.claimedAt).sort((a, b) => a - b);
  const startedAt = sub.createdAt;
  const elapsedDays = Math.max(0, (now.getTime() / 1000 - startedAt) / 86400);
  const periodsElapsed = Math.max(1, Math.floor(elapsedDays / sub.intervalDays) + 1);
  // A period counts as claimed if any claim falls within it.
  let claimedPeriods = 0;
  for (let i = 0; i < periodsElapsed; i++) {
    const periodStart = startedAt + i * sub.intervalDays * 86400;
    const periodEnd = periodStart + sub.intervalDays * 86400;
    if (sourceClaims.some((c) => c >= periodStart && c < periodEnd)) claimedPeriods++;
  }
  return Math.round((claimedPeriods / periodsElapsed) * 100);
}

export function computeSubscriptionSummary(
  sub: SpendSubscriptionRow,
  purchases: PurchaseRow[],
  currencies: MasterDataRow[],
  linkedSource: IncomeSourceRow | null,
  claims: IncomeClaimRow[],
  blendedDollarsPerPull: number | null,
  now: Date = new Date(),
): SubscriptionSummary {
  const linkedPurchases = purchases.filter((p) => p.subscriptionId === sub.id);
  const paidSoFarCents = linkedPurchases.reduce((a, p) => a + p.amountCents, 0) || (sub.status === "active" ? sub.priceCents : 0);
  const pullsGranted = pullsFromGrants(sub.grants, currencies);
  const chargesCount = Math.max(1, linkedPurchases.length);
  const dollarsPerPull = pullsGranted > 0 ? centsToDollars(sub.priceCents) / pullsGranted : null;

  const claimRatePercent = claimRateForSubscription(sub, linkedSource, claims, now);

  let renewsInDays: number | null = null;
  if (sub.intervalDays) {
    const lastCharge = linkedPurchases.length > 0 ? linkedPurchases.reduce((a, p) => (p.purchasedAt > a ? p.purchasedAt : a), linkedPurchases[0]!.purchasedAt) : null;
    const anchor = lastCharge ? new Date(lastCharge).getTime() : sub.createdAt * 1000;
    const next = anchor + sub.intervalDays * 86400000;
    renewsInDays = Math.round((next - now.getTime()) / 86400000);
  }

  // Templated, not freeform — same "~4 fixed shapes with real numbers" rule as wishlist's computeTheCall.
  let verdict: SubscriptionVerdict = "keep";
  if (claimRatePercent != null && claimRatePercent < 40) verdict = "cancel";
  else if (claimRatePercent != null && claimRatePercent < 75) verdict = "review";
  else if (dollarsPerPull != null && blendedDollarsPerPull != null && dollarsPerPull > blendedDollarsPerPull * 1.3) verdict = "review";

  void chargesCount;
  return { subscription: sub, claimRatePercent, paidSoFarCents, pullsGranted, dollarsPerPull, renewsInDays, verdict };
}

// --- value tab (screen 36) --------------------------------------------------

export interface ValueByTypeRow {
  kind: string;
  spentCents: number;
  buys: number;
  pulls: number;
  dollarsPerPull: number | null;
}

const KIND_LABELS: Record<PurchaseRow["kind"], string> = {
  top_up: "Raw top-ups",
  battle_pass: "Battle passes",
  subscription_charge: "Subscriptions",
  one_off: "One-offs",
  bundle: "Event bundles",
};

export function computeValueByType(purchases: PurchaseRow[], currencies: MasterDataRow[]): ValueByTypeRow[] {
  const byKind = new Map<PurchaseRow["kind"], PurchaseRow[]>();
  for (const p of purchases) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
  return [...byKind.entries()].map(([kind, rows]) => {
    const spentCents = rows.reduce((a, p) => a + p.amountCents, 0);
    const pulls = rows.reduce((a, p) => a + pullsFromGrants(p.grants, currencies), 0);
    return { kind: KIND_LABELS[kind], spentCents, buys: rows.length, pulls, dollarsPerPull: pulls > 0 ? centsToDollars(spentCents) / pulls : null };
  });
}

export function computeTheOneChange(byType: ValueByTypeRow[], blendedDollarsPerPull: number | null): { worst: ValueByTypeRow; pullsForgone: number; blendedIfSkipped: number | null } | null {
  const withRate = byType.filter((t) => t.dollarsPerPull != null);
  if (withRate.length < 2 || blendedDollarsPerPull == null) return null;
  const worst = withRate.reduce((a, b) => (b.dollarsPerPull! > a.dollarsPerPull! ? b : a));
  const rest = byType.filter((t) => t !== worst);
  const restSpentCents = rest.reduce((a, t) => a + t.spentCents, 0);
  const restPulls = rest.reduce((a, t) => a + t.pulls, 0);
  const bestOtherRate = rest.filter((t) => t.dollarsPerPull != null).sort((a, b) => a.dollarsPerPull! - b.dollarsPerPull!)[0]?.dollarsPerPull ?? blendedDollarsPerPull;
  const pullsIfSpentElsewhere = bestOtherRate > 0 ? Math.round(centsToDollars(worst.spentCents) / bestOtherRate) : 0;
  const pullsForgone = pullsIfSpentElsewhere - worst.pulls;
  const totalPullsIfSkipped = restPulls + pullsIfSpentElsewhere;
  const totalCentsIfSkipped = restSpentCents + worst.spentCents;
  const blendedIfSkipped = totalPullsIfSkipped > 0 ? centsToDollars(totalCentsIfSkipped) / totalPullsIfSkipped : null;
  return { worst, pullsForgone, blendedIfSkipped };
}

// --- budgets (screen 35) ----------------------------------------------------

export interface BudgetStatus {
  spentCents: number;
  capCents: number;
  usedPercent: number;
  breached: boolean;
}

export function computeBudgetStatus(capCents: number, spentCents: number): BudgetStatus {
  const usedPercent = capCents > 0 ? Math.round((spentCents / capCents) * 100) : 0;
  return { spentCents, capCents, usedPercent, breached: spentCents > capCents };
}

export function computeBudgetSuggestion(monthly: MonthlySpendPoint[], capCents: number): { suggestedCapCents: number; breachCount: number } | null {
  const breachCount = monthly.filter((m) => m.totalCents > capCents).length;
  if (breachCount < monthly.length / 3) return null; // not breaching often enough to be worth flagging
  const avg = monthly.reduce((a, m) => a + m.totalCents, 0) / monthly.length;
  return { suggestedCapCents: Math.round(avg / 500) * 500, breachCount }; // round to nearest $5
}
