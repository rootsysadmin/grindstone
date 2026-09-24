import type { BattlePassProgressRow, EventProgressRow, IncomeClaimRow, IncomeSourceRow, MasterDataRow, PityPoolState } from "@grindstone/shared";
import { poolKeyForBanner } from "../pull-log/pityView.ts";
import { computeRemainingProjection, pullsAvailable } from "../planner/materialNeeds.ts";
import type { EventRewardRow } from "../master-data/api.ts";

/**
 * Pure client-side derivation over banners/events/tasks/income data that
 * already exists (Stage 1/3/5 rows) — same architecture as
 * today/taskStats.ts and today/runway.ts: no state, computed on read,
 * `now`/range params default sensibly but are injectable for testing.
 */

export type CalendarEntryKind = "banner" | "event" | "weekly-reset" | "battle-pass" | "income";

export interface CalendarEntry {
  id: string;
  kind: CalendarEntryKind;
  label: string;
  subLabel?: string;
  category: string;
  startDate: string | null;
  endDate: string | null;
  isRerun?: boolean;
  progressFraction?: number | null;
  rewardLabel?: string;
  /** Event id + current/target — set only for events, whose progress is a real number you log (stage clears), unlike a banner's pity fraction which is derived from the pull log and isn't directly editable. */
  eventId?: number;
  progressCurrent?: number;
  progressTarget?: number;
}

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(dateStr: string, now: Date = new Date()): number {
  return Math.round((new Date(dateStr).getTime() - new Date(dateOnly(now)).getTime()) / 86400000);
}

export function isLive(entry: CalendarEntry, now: Date = new Date()): boolean {
  if (!entry.startDate || !entry.endDate) return false;
  const today = dateOnly(now);
  return entry.startDate <= today && today <= entry.endDate;
}

/**
 * A banner is a rerun if the same featured character/equipment already
 * appeared on an earlier-dated banner — no `isRerun` column exists, this
 * is derived from real data rather than fabricated.
 */
export function buildBannerEntries(
  banners: MasterDataRow[],
  characterById: Map<number, MasterDataRow>,
  equipmentById: Map<number, MasterDataRow>,
  pools: PityPoolState[],
): CalendarEntry[] {
  const sorted = [...banners].sort((a, b) => String(a.startDate ?? "").localeCompare(String(b.startDate ?? "")));
  return sorted.map((b, i) => {
    const charId = (b.featuredCharacterId as number | null) ?? null;
    const equipId = (b.featuredEquipmentId as number | null) ?? null;
    const featuredKey = charId ?? equipId;
    const isRerun =
      featuredKey != null &&
      sorted.slice(0, i).some((prior) => ((prior.featuredCharacterId as number | null) ?? (prior.featuredEquipmentId as number | null)) === featuredKey);
    const featuredName = charId != null ? characterById.get(charId)?.name : equipId != null ? equipmentById.get(equipId)?.name : undefined;

    const poolKey = poolKeyForBanner({
      id: b.id,
      name: b.name,
      type: (b.type as string | null) ?? null,
      carriesPity: !!b.carriesPity,
      fiftyFifty: !!b.fiftyFifty,
      pity: (b.pity as number | null) ?? null,
    });
    const pool = pools.find((p) => p.poolKey === poolKey || p.bannerIds.includes(b.id));
    const cap = (b.softPity as number | null) ?? (b.pity as number | null);
    const progressFraction = pool && cap ? Math.min(1, pool.currentPity / cap) : null;

    return {
      id: `banner:${b.id}`,
      kind: "banner",
      label: b.name,
      subLabel: featuredName,
      category: (b.type as string | null) ?? "Banner",
      startDate: (b.startDate as string | null) ?? null,
      endDate: (b.endDate as string | null) ?? null,
      isRerun,
      progressFraction,
      rewardLabel: pool && cap ? `pity ${pool.currentPity}/${cap}` : undefined,
    } satisfies CalendarEntry;
  });
}

/**
 * An event's completion target is its stageCount when set, else 1 (a plain
 * "claimed" checkbox) — but only when it actually has a reward to claim.
 * With neither a stageCount nor a reward there's nothing real to track, so
 * it's treated as always-done (progressFraction 1) rather than perpetually
 * 0% — see apps/api/src/routes/eventProgress.ts for the matching
 * reward-crediting logic on the write side.
 */
export function buildEventEntries(
  events: MasterDataRow[],
  eventProgress: EventProgressRow[],
  eventRewards: EventRewardRow[],
  currencyById: Map<number, MasterDataRow>,
  materialById: Map<number, MasterDataRow>,
): CalendarEntry[] {
  return events.map((e) => {
    const stageCount = (e.stageCount as number | null) ?? null;
    const rewards = eventRewards.filter((r) => r.eventId === e.id);
    const target = stageCount ?? (rewards.length > 0 ? 1 : null);
    const current = eventProgress.find((p) => p.eventId === e.id)?.current ?? 0;
    const rewardLabel =
      rewards.length > 0
        ? rewards
            .map((r) => {
              const name = r.kind === "currency" ? currencyById.get(r.currencyId ?? -1)?.name : materialById.get(r.materialId ?? -1)?.name;
              return `${r.quantity ?? "?"} ${name ?? "?"}`;
            })
            .join(", ")
        : ((e.kind as string | null) ?? undefined);
    return {
      id: `event:${e.id}`,
      kind: "event",
      label: e.name,
      subLabel: (e.kind as string | null) ?? undefined,
      category: "Event",
      startDate: (e.startDate as string | null) ?? null,
      endDate: (e.endDate as string | null) ?? null,
      progressFraction: target != null ? Math.min(1, current / target) : 1,
      rewardLabel,
      eventId: e.id as number,
      progressCurrent: target != null ? current : undefined,
      progressTarget: target ?? undefined,
    } satisfies CalendarEntry;
  });
}

/** One entry per ISO-week Monday in range — the same reset boundary today/taskStats.ts's isoWeekKey already treats as "the weekly reset." */
export function weeklyResetEntries(rangeStart: Date, rangeEnd: Date): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  while (d <= end) {
    if (d.getDay() === 1) {
      const key = dateOnly(d);
      entries.push({ id: `weekly-reset:${key}`, kind: "weekly-reset", label: "Weekly reset", category: "Reset", startDate: key, endDate: key });
    }
    d.setDate(d.getDate() + 1);
  }
  return entries;
}

/** An enabled recurring income source's next-available date, projected forward through the range from its last real claim (or now, if never claimed) — same claim data computeRemainingProjection already consumes. */
export function incomeEntries(sources: IncomeSourceRow[], claims: IncomeClaimRow[], rangeStart: Date, rangeEnd: Date, now: Date = new Date()): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const s of sources) {
    if (!s.enabled || s.cadence === "one-time" || !s.intervalDays) continue;
    const sourceClaims = claims.filter((c) => c.incomeSourceId === s.id);
    let next =
      sourceClaims.length === 0 ? new Date(now) : new Date((Math.max(...sourceClaims.map((c) => c.claimedAt)) + s.intervalDays * 86400) * 1000);
    while (next.getTime() < rangeStart.getTime()) next = new Date(next.getTime() + s.intervalDays * 86400000);
    while (next.getTime() <= rangeEnd.getTime()) {
      const key = dateOnly(next);
      entries.push({ id: `income:${s.id}:${key}`, kind: "income", label: s.name, category: "Income", startDate: key, endDate: key });
      next = new Date(next.getTime() + s.intervalDays * 86400000);
    }
  }
  return entries;
}

export function battlePassEntry(bp: BattlePassProgressRow | undefined): CalendarEntry | null {
  if (!bp?.endDate) return null;
  return {
    id: "battle-pass",
    kind: "battle-pass",
    label: "Battle pass ends",
    category: "Deadline",
    startDate: null,
    endDate: bp.endDate,
    progressFraction: bp.maxLevel ? Math.min(1, bp.currentLevel / bp.maxLevel) : null,
  };
}

export interface Pivot {
  date: string;
  ending: CalendarEntry[];
  starting: CalendarEntry[];
}

/** The next date the live banner/event set changes — soonest end-date among everything currently live, plus whatever starts that same day. Replaces the mockup's fabricated "next patch" panel with something real. */
export function findPivot(entries: CalendarEntry[], now: Date = new Date()): Pivot | null {
  const live = entries.filter((e) => (e.kind === "banner" || e.kind === "event") && isLive(e, now));
  if (live.length === 0) return null;
  const nextEnd = live.reduce((min, e) => (e.endDate! < min ? e.endDate! : min), live[0]!.endDate!);
  const ending = live.filter((e) => e.endDate === nextEnd);
  const starting = entries.filter((e) => (e.kind === "banner" || e.kind === "event") && e.startDate === nextEnd);
  return { date: nextEnd, ending, starting };
}

export interface MonthTotals {
  annulithIn: number;
  pulls: number | null;
  deadlines: number;
  resets: number;
}

export function monthTotals(
  entries: CalendarEntry[],
  incomeSources: IncomeSourceRow[],
  claims: IncomeClaimRow[],
  pullCurrency: MasterDataRow | undefined,
  monthStart: Date,
  monthEnd: Date,
): MonthTotals {
  const windowDays = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
  const relevantSources = pullCurrency ? incomeSources.filter((s) => s.currencyId === pullCurrency.id) : incomeSources;
  const annulithIn = relevantSources.reduce((a, s) => a + computeRemainingProjection(s, claims, windowDays), 0);
  const pulls = pullCurrency ? pullsAvailable(annulithIn, (pullCurrency.pullCost as number | null) ?? null) : null;
  const startKey = dateOnly(monthStart);
  const endKey = dateOnly(monthEnd);
  const deadlines = entries.filter(
    (e) => (e.kind === "banner" || e.kind === "event" || e.kind === "battle-pass") && e.endDate != null && e.endDate >= startKey && e.endDate <= endKey,
  ).length;
  const resets = entries.filter((e) => e.kind === "weekly-reset" && e.startDate != null && e.startDate >= startKey && e.startDate <= endKey).length;
  return { annulithIn, pulls, deadlines, resets };
}
