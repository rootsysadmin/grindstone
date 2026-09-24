import type { PityPoolState, PullLogRow } from "@grindstone/shared";

/**
 * Pure client-side derivation over the API's raw pull log + pity state —
 * same architecture as planner/materialNeeds.ts: computed on read from
 * already-fetched data, never stored, so it can't drift.
 */

export interface BannerLite {
  id: number;
  name: string;
  type: string | null;
  carriesPity: boolean;
  fiftyFifty: boolean;
  pity: number | null;
}

/** Mirrors apps/api/src/core/pityEngine.ts's pool-key rule — kept in sync manually, it's one line. */
export function poolKeyForBanner(b: BannerLite): string {
  return b.carriesPity && b.type ? `type:${b.type}` : `banner:${b.id}`;
}

export function poolLabel(pool: PityPoolState): string {
  return pool.type ?? "Other";
}

/** Default pool selection: whichever pool the most recently logged pull belongs to. */
export function defaultPoolKey(pools: PityPoolState[], pulls: PullLogRow[], banners: BannerLite[]): string | null {
  if (pools.length === 0) return null;
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const sorted = pulls
    .slice()
    .sort((a, b) => (a.pulledAt < b.pulledAt ? 1 : a.pulledAt > b.pulledAt ? -1 : b.id - a.id));
  for (const pull of sorted) {
    const banner = bannerById.get(pull.bannerId);
    if (!banner) continue;
    const key = poolKeyForBanner(banner);
    if (pools.some((p) => p.poolKey === key)) return key;
  }
  return pools[0]!.poolKey;
}

export interface ChartBar {
  label: string;
  value: number;
  inProgress: boolean;
}

/** Bars for the "pity spent per top-rank pull" chart, oldest to newest, plus one trailing in-progress bar when pity is currently banked. */
export function buildChartBars(pool: PityPoolState, maxBars = 8): ChartBar[] {
  const history = pool.history
    .slice()
    .sort((a, b) => (a.pulledAt < b.pulledAt ? -1 : a.pulledAt > b.pulledAt ? 1 : a.pullId - b.pullId));
  const bars: ChartBar[] = history.map((h) => ({ label: String(h.pityAtPull), value: h.pityAtPull, inProgress: false }));
  if (pool.currentPity > 0) bars.push({ label: `${pool.currentPity}?`, value: pool.currentPity, inProgress: true });
  return bars.slice(-maxBars);
}

export interface PoolRates {
  totalPulls: number;
  /** 100% = won on pull 1 every time; 0% = hit hard pity every time. See computeRates for the exact formula. */
  luckRatePercent: number | null;
  actualSpent: number;
  maxPossible: number;
  luckiest: { value: number; itemName: string; count: number } | null;
  worst: { value: number; itemName: string; count: number } | null;
}

/**
 * Occurrence-rate ("X% of pulls are S-rank") isn't a useful stat with a
 * sample size of a handful of pulls — replaced with a luck measure instead,
 * inverted so higher is better: a win on pull 1 (pityAtPull=1) reads 100%,
 * hitting hard pity (pityAtPull=cap) reads 0%, linear in between. Per entry
 * that's `(cap - pityAtPull) / (cap - 1)`; aggregated across entries as
 * `sum(cap - pityAtPull) / sum(cap - 1)` rather than averaging the
 * per-entry ratios, so it reduces to the exact per-entry formula for a
 * single pull and still needs no special-casing for 50/50: a "lost" entry
 * is a real logged pull that was NOT luckily won, so it drags the average
 * down same as any other entry — losing right before hitting pity (a bad
 * loss) hurts more than losing early (a cheap loss), same as it should.
 */
export function computeRates(pool: PityPoolState, poolPulls: PullLogRow[], banners: BannerLite[]): PoolRates {
  const totalPulls = poolPulls.reduce((a, p) => a + p.quantity, 0);
  const bannerById = new Map(banners.map((b) => [b.id, b]));

  let actual = 0;
  let possible = 0;
  let luckNumerator = 0;
  let luckDenominator = 0;
  // Group by item identity (not per-pull) — several copies of the same
  // character (dupes/awakening fodder) shouldn't each count as their own
  // "luckiest"/"worst" data point. Average a character's own pulls first,
  // then compare averages across characters.
  const byItem = new Map<string, { total: number; count: number; itemName: string }>();
  for (const h of pool.history) {
    const pull = poolPulls.find((p) => p.id === h.pullId);
    const itemName = pull?.itemName ?? "?";
    const key = pull?.itemId != null ? `id:${pull.itemId}` : `name:${itemName}`;
    const entry = byItem.get(key) ?? { total: 0, count: 0, itemName };
    entry.total += h.pityAtPull;
    entry.count += 1;
    byItem.set(key, entry);

    const cap = bannerById.get(h.bannerId)?.pity ?? null;
    if (cap != null && cap >= 1) {
      actual += h.pityAtPull;
      possible += cap;
      luckNumerator += Math.max(0, cap - h.pityAtPull);
      luckDenominator += Math.max(0, cap - 1);
    }
  }

  let luckiest: PoolRates["luckiest"] = null;
  let worst: PoolRates["worst"] = null;
  for (const { total, count, itemName } of byItem.values()) {
    const value = total / count;
    if (!luckiest || value < luckiest.value) luckiest = { value, itemName, count };
    if (!worst || value > worst.value) worst = { value, itemName, count };
  }

  return {
    totalPulls,
    luckRatePercent: luckDenominator > 0 ? (luckNumerator / luckDenominator) * 100 : null,
    actualSpent: actual,
    maxPossible: possible,
    luckiest,
    worst,
  };
}

export interface FiftyFiftyStripEntry {
  pulledAt: string;
  result: "won" | "lost" | "n/a" | null;
}

export function fiftyFiftyStrip(pool: PityPoolState, count = 5): FiftyFiftyStripEntry[] {
  const sorted = pool.history
    .slice()
    .sort((a, b) => (a.pulledAt < b.pulledAt ? -1 : a.pulledAt > b.pulledAt ? 1 : a.pullId - b.pullId));
  return sorted.slice(-count).map((h) => ({ pulledAt: h.pulledAt, result: h.fiftyFiftyResult }));
}

export interface BannerSpend {
  bannerId: number;
  bannerName: string;
  count: number;
}

/** Global across every banner, not pool-scoped — matches the mockup listing every banner (incl. Standard) side by side. */
export function spendByBanner(pulls: PullLogRow[], banners: BannerLite[]): BannerSpend[] {
  const counts = new Map<number, number>();
  for (const p of pulls) counts.set(p.bannerId, (counts.get(p.bannerId) ?? 0) + p.quantity);
  return banners
    .map((b) => ({ bannerId: b.id, bannerName: b.name, count: counts.get(b.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}
