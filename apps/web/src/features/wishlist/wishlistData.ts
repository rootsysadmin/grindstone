import type {
  CurrencyInventoryRow,
  IncomeClaimRow,
  IncomeSourceRow,
  MasterDataRow,
  PityPoolState,
  PullLogRow,
  SavingsRuleRow,
  WishlistTargetRow,
  WishlistTargetStatus,
} from "@grindstone/shared";
import { computeRemainingProjection, currencyBalance, pullsAvailable } from "../planner/materialNeeds.ts";
import { poolKeyForBanner } from "../pull-log/pityView.ts";

/**
 * Pure client-side derivation over targets/banners/pity/income/pull-log
 * data that already exists — same architecture as today/runway.ts and
 * calendar/calendarData.ts. A target's own row only stores what can't be
 * derived (priority, budget, the manual "deferred"/"locked" states); its
 * live status, spend, and affordability are all computed here on every
 * read, never stored, so they can't drift from the real pull log.
 */

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function targetItemId(target: WishlistTargetRow): number | null {
  return target.targetCharacterId ?? target.targetEquipmentId;
}

export function targetLabel(target: WishlistTargetRow, characterById: Map<number, MasterDataRow>, equipmentById: Map<number, MasterDataRow>): string {
  if (target.targetCharacterId != null) return characterById.get(target.targetCharacterId)?.name ?? "Unknown character";
  if (target.targetEquipmentId != null) return equipmentById.get(target.targetEquipmentId)?.name ?? "Unknown item";
  return "Unknown target";
}

/**
 * A target's live status: "deferred" is the one manual state (set via the
 * remove-confirm dialog) and is read straight from the stored column;
 * everything else is derived from real data every time — obtained the
 * moment a matching pull-log entry appears on the target's banner,
 * expired once that banner's end date passes with no match, active
 * otherwise (including "no banner yet," which can never expire or match).
 */
export function computeTargetStatus(target: WishlistTargetRow, banner: MasterDataRow | undefined, pulls: PullLogRow[], now: Date = new Date()): WishlistTargetStatus {
  if (target.status === "deferred") return "deferred";
  if (target.bannerId == null) return "active";
  const itemId = targetItemId(target);
  const createdDate = dateOnly(new Date(target.createdAt * 1000));
  const relevant = pulls.filter((p) => p.bannerId === target.bannerId && p.pulledAt >= createdDate);
  if (itemId != null && relevant.some((p) => p.itemId === itemId)) return "obtained";
  const endDate = (banner?.endDate as string | null) ?? null;
  if (endDate && endDate < dateOnly(now)) return "expired";
  return "active";
}

export interface TargetAffordability {
  targetId: number;
  pullsNow: number;
  pullsByBannerEnd: number | null;
  reserved: number;
  available: number;
  affordabilityPercent: number | null;
  verdict: "AFFORDABLE" | "TIGHT" | "SHORT" | null;
  daysUntilBannerEnd: number | null;
  guaranteeReachable: boolean | null;
}

/**
 * available pulls = projected balance by the banner's end (or just current
 * balance, if no banner/date yet) minus every higher-priority, active,
 * reserve-flagged target's own budget — the same pool of future pulls is
 * shared top-down by priority, so a P1 reservation directly shrinks what
 * P2 can honestly claim as affordable.
 */
export function computeAffordability(
  target: WishlistTargetRow,
  activeTargets: WishlistTargetRow[], // already filtered to derived-active targets — see computeTargetStatus; a raw .status check here would miss auto-resolved obtained/expired targets
  banner: MasterDataRow | undefined,
  pullCurrency: MasterDataRow | undefined,
  inventory: CurrencyInventoryRow[],
  incomeSources: IncomeSourceRow[],
  claims: IncomeClaimRow[],
  pools: PityPoolState[],
  now: Date = new Date(),
): TargetAffordability {
  const pullCost = (pullCurrency?.pullCost as number | null) ?? null;
  const balance = pullCurrency ? currencyBalance(inventory, pullCurrency.id as number) : 0;
  const pullsNow = pullsAvailable(balance, pullCost) ?? 0;

  const endDate = (banner?.endDate as string | null) ?? null;
  const daysUntilBannerEnd = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - now.getTime()) / 86400000)) : null;

  let pullsByBannerEnd: number | null = null;
  if (endDate && pullCurrency) {
    const projected = incomeSources
      .filter((s) => s.currencyId === pullCurrency.id)
      .reduce((a, s) => a + computeRemainingProjection(s, claims, daysUntilBannerEnd ?? 0), 0);
    pullsByBannerEnd = pullsAvailable(balance + projected, pullCost);
  }

  const reserved = activeTargets
    .filter((t) => t.reserveFromToday && t.priority < target.priority)
    .reduce((a, t) => a + t.budgetCeilingPulls, 0);

  const baseline = pullsByBannerEnd ?? pullsNow;
  const available = Math.max(0, baseline - reserved);
  const affordabilityPercent = target.budgetCeilingPulls > 0 ? Math.round(Math.min(100, (available / target.budgetCeilingPulls) * 100)) : null;
  const verdict = affordabilityPercent == null ? null : affordabilityPercent >= 90 ? "AFFORDABLE" : affordabilityPercent >= 50 ? "TIGHT" : "SHORT";

  let guaranteeReachable: boolean | null = null;
  if (banner) {
    const cap = (banner.pity as number | null) ?? null;
    if (cap != null) {
      const key = poolKeyForBanner({
        id: banner.id as number,
        name: banner.name,
        type: (banner.type as string | null) ?? null,
        carriesPity: !!banner.carriesPity,
        fiftyFifty: !!banner.fiftyFifty,
        pity: cap,
      });
      const pool = pools.find((p) => p.poolKey === key || p.bannerIds.includes(banner.id as number));
      const currentPity = pool?.currentPity ?? 0;
      guaranteeReachable = currentPity + available >= cap;
    }
  }

  return { targetId: target.id, pullsNow, pullsByBannerEnd, reserved, available, affordabilityPercent, verdict, daysUntilBannerEnd, guaranteeReachable };
}

export interface RuleEvaluation {
  ruleId: number;
  statusText: string;
  blocking: boolean;
  warning: boolean;
}

export interface RuleContext {
  targets: WishlistTargetRow[]; // active targets, sorted by priority ascending
  affordabilityByTarget: Map<number, TargetAffordability>;
  banners: Map<number, MasterDataRow>;
  characterById: Map<number, MasterDataRow>;
  equipmentById: Map<number, MasterDataRow>;
  characterBuilds: { characterId: number; resonanceLevel: number }[];
}

/**
 * One small switch per rule kind (a fixed set, not a generic condition
 * builder — see docs/progress.md's Stage 7 entry) each reusing the
 * affordability/pity numbers already computed above rather than
 * recomputing. Only called for enabled rules — a disabled rule's status is
 * just "off," handled by the caller without needing to evaluate it.
 */
export function evaluateSavingsRules(rules: SavingsRuleRow[], ctx: RuleContext): RuleEvaluation[] {
  const { targets, affordabilityByTarget, banners, characterById, equipmentById, characterBuilds } = ctx;

  return rules.map((rule): RuleEvaluation => {
    switch (rule.kind) {
      case "pulls_floor": {
        const held = targets[0] ? affordabilityByTarget.get(targets[0].id)?.pullsNow ?? 0 : 0;
        const floor = rule.threshold ?? 0;
        const ok = held >= floor;
        return { ruleId: rule.id, statusText: `${held} held · ${ok ? "ok" : "below floor"}`, blocking: !ok && rule.action === "block", warning: !ok && rule.action === "warn" };
      }
      case "guarantee_only": {
        const inScope = targets.filter((t) => {
          if (!rule.scopeBannerType) return true;
          const banner = t.bannerId != null ? banners.get(t.bannerId) : undefined;
          return (banner?.type as string | undefined) === rule.scopeBannerType;
        });
        const notGuaranteed = inScope.find((t) => affordabilityByTarget.get(t.id)?.guaranteeReachable === false);
        const ok = !notGuaranteed;
        return {
          ruleId: rule.id,
          statusText: ok ? "guaranteed · ok" : `not guaranteed · ${targetLabel(notGuaranteed!, characterById, equipmentById)}`,
          blocking: !ok && rule.action === "block",
          warning: !ok && rule.action === "warn",
        };
      }
      case "reserve_priority": {
        const blocked = targets.find((t, i) => {
          if (i === 0) return false;
          const aff = affordabilityByTarget.get(t.id);
          return !!aff && aff.reserved > 0 && (aff.affordabilityPercent ?? 100) < 100;
        });
        return {
          ruleId: rule.id,
          statusText: blocked ? `BLOCKING ${targetLabel(blocked, characterById, equipmentById).toUpperCase()}` : "clear",
          blocking: !!blocked && rule.action === "block",
          warning: !!blocked && rule.action === "warn",
        };
      }
      case "banner_ending_warn": {
        const threshold = rule.threshold ?? 3;
        const soonest = targets
          .map((t) => affordabilityByTarget.get(t.id)?.daysUntilBannerEnd)
          .filter((d): d is number => d != null)
          .sort((a, b) => a - b)[0];
        const near = soonest != null && soonest <= threshold;
        return {
          ruleId: rule.id,
          statusText: soonest != null ? `${soonest}d · ${near ? "warn" : "quiet"}` : "no banner dates",
          blocking: false,
          warning: near && rule.action === "warn",
        };
      }
      case "dupe_cap": {
        const cap = rule.threshold ?? 6;
        const overCap = characterBuilds.find((b) => b.resonanceLevel >= cap);
        return {
          ruleId: rule.id,
          statusText: overCap ? `${characterById.get(overCap.characterId)?.name ?? "a character"} at S${overCap.resonanceLevel}` : "clear",
          blocking: !!overCap && rule.action === "block",
          warning: !!overCap && rule.action === "warn",
        };
      }
      case "skip_banner_type": {
        const inScope = targets.find((t) => {
          const banner = t.bannerId != null ? banners.get(t.bannerId) : undefined;
          return (banner?.type as string | undefined) === rule.scopeBannerType;
        });
        return {
          ruleId: rule.id,
          statusText: inScope ? `BLOCKING ${targetLabel(inScope, characterById, equipmentById).toUpperCase()}` : "clear",
          blocking: !!inScope && rule.action === "block",
          warning: !!inScope && rule.action === "warn",
        };
      }
    }
  });
}

export interface CallVerdict {
  targetId: number | null;
  headline: string;
  reason: string;
  action: "pull" | "hold" | "skip" | "none";
}

/** ~4 templates filled in with real computed numbers — see docs/progress.md's Stage 7 entry for why this isn't freeform generated prose. */
export function computeTheCall(
  activeTargets: WishlistTargetRow[], // sorted by priority ascending
  affordabilityByTarget: Map<number, TargetAffordability>,
  ruleEvaluations: RuleEvaluation[],
  characterById: Map<number, MasterDataRow>,
  equipmentById: Map<number, MasterDataRow>,
): CallVerdict {
  const top = activeTargets[0];
  if (!top) return { targetId: null, headline: "Nothing on the wishlist yet.", reason: "Add a target to get a verdict.", action: "none" };

  const label = targetLabel(top, characterById, equipmentById);
  const aff = affordabilityByTarget.get(top.id);
  const blockingRule = ruleEvaluations.find((r) => r.blocking);

  if (blockingRule) {
    return { targetId: top.id, headline: `Hold on ${label}.`, reason: `A savings rule is active: ${blockingRule.statusText.toLowerCase()}.`, action: "hold" };
  }
  if (!aff || aff.affordabilityPercent == null) {
    return { targetId: top.id, headline: `Not enough data for ${label} yet.`, reason: "Set a budget ceiling to get a verdict.", action: "none" };
  }
  if (aff.verdict === "AFFORDABLE") {
    const byWhen = aff.daysUntilBannerEnd != null ? "by the banner's end" : "right now";
    return { targetId: top.id, headline: `Pull for ${label}.`, reason: `You'll hold ${aff.available} of the ${top.budgetCeilingPulls} pulls budgeted ${byWhen}.`, action: "pull" };
  }
  const next = activeTargets[1];
  const nextLabel = next ? targetLabel(next, characterById, equipmentById) : null;
  const short = Math.max(0, top.budgetCeilingPulls - aff.available);
  const byWhen = aff.daysUntilBannerEnd != null ? "by the banner's end" : "right now";
  return {
    targetId: top.id,
    headline: nextLabel ? `Skip ${label}. Bank for ${nextLabel}.` : `Hold on ${label}.`,
    reason: `${label} is short ${short} of its ${top.budgetCeilingPulls}-pull budget ${byWhen}.`,
    action: nextLabel ? "skip" : "hold",
  };
}

export interface TargetOutcome {
  targetId: number;
  status: WishlistTargetStatus;
  budgeted: number;
  spent: number;
  pityAtResolution: number | null;
  fiftyFiftyResult: "won" | "lost" | "n/a" | null;
  outcome: WishlistTargetStatus;
}

/** Pulls "spent" on a target are pull_log rows on its banner from the target's creation onward — same derive-at-read-time rule as computeTargetStatus, no manual attribution step. */
export function pullHistoryForTarget(target: WishlistTargetRow, pulls: PullLogRow[]): TargetOutcome {
  const createdDate = dateOnly(new Date(target.createdAt * 1000));
  const relevant = target.bannerId != null ? pulls.filter((p) => p.bannerId === target.bannerId && p.pulledAt >= createdDate) : [];
  const spent = relevant.reduce((a, p) => a + p.quantity, 0);
  const itemId = targetItemId(target);
  const sorted = relevant.slice().sort((a, b) => (a.pulledAt < b.pulledAt ? -1 : a.pulledAt > b.pulledAt ? 1 : a.id - b.id));
  const matchPull = itemId != null ? sorted.find((p) => p.itemId === itemId) : undefined;
  const lastPull = sorted[sorted.length - 1];
  return {
    targetId: target.id,
    status: target.status,
    budgeted: target.budgetCeilingPulls,
    spent,
    pityAtResolution: matchPull?.pityAtPull ?? lastPull?.pityAtPull ?? null,
    fiftyFiftyResult: matchPull?.fiftyFiftyResult ?? null,
    outcome: target.status,
  };
}
