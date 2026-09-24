/**
 * Pure pity/guarantee computation — no DB access (see apps/api/CLAUDE.md's
 * core/ convention), no dependency on games/<slug>/config.ts.
 *
 * A pull only needs to know it exists; it never needs to know which rank
 * string is "the top rank" — a row counts as the pity-relevant/top-rank
 * pull purely by having a non-null pityAtPull (set by the log-pull dialog,
 * which in practice only fills it in for the rare pull that actually
 * consumed pity). This keeps the engine fully data-driven and game-agnostic.
 *
 * Pools: banners with carriesPity=true join one pool per distinct `type`
 * (a featured pool's pity/guarantee state carries across every phase of
 * that type, never resetting on its own — confirmed by the user, standard
 * gacha behavior). Banners with carriesPity=false each get their own
 * singleton pool. This also naturally separates the Standard pool from
 * every featured pool, since they're different `type` values.
 */

export interface PityBanner {
  id: number;
  type: string | null;
  carriesPity: boolean;
  fiftyFifty: boolean;
}

export interface PityPull {
  id: number;
  bannerId: number;
  quantity: number;
  pityAtPull: number | null;
  fiftyFiftyResult: "won" | "lost" | "n/a" | null;
  pulledAt: string;
}

export interface PityHistoryEntry {
  pullId: number;
  bannerId: number;
  pityAtPull: number;
  fiftyFiftyResult: "won" | "lost" | "n/a" | null;
  pulledAt: string;
}

export interface PityPoolState {
  poolKey: string;
  type: string | null;
  bannerIds: number[];
  fiftyFifty: boolean;
  currentPity: number;
  guaranteed: boolean | null;
  history: PityHistoryEntry[];
}

export function computePityState(banners: PityBanner[], pulls: PityPull[]): PityPoolState[] {
  const poolKeyForBanner = new Map<number, string>();
  const pools = new Map<string, PityPoolState>();

  for (const banner of banners) {
    const key = banner.carriesPity && banner.type ? `type:${banner.type}` : `banner:${banner.id}`;
    poolKeyForBanner.set(banner.id, key);
    const existing = pools.get(key);
    if (existing) {
      existing.bannerIds.push(banner.id);
      existing.fiftyFifty = existing.fiftyFifty || banner.fiftyFifty;
    } else {
      pools.set(key, {
        poolKey: key,
        type: banner.type,
        bannerIds: [banner.id],
        fiftyFifty: banner.fiftyFifty,
        currentPity: 0,
        guaranteed: null,
        history: [],
      });
    }
  }

  const pullsByPool = new Map<string, PityPull[]>();
  for (const pull of pulls) {
    const key = poolKeyForBanner.get(pull.bannerId);
    if (!key) continue; // pull references a banner not passed in — ignore rather than throw
    const list = pullsByPool.get(key) ?? [];
    list.push(pull);
    pullsByPool.set(key, list);
  }

  for (const [key, pool] of pools) {
    const poolPulls = (pullsByPool.get(key) ?? []).slice().sort((a, b) => {
      const dateCmp = a.pulledAt.localeCompare(b.pulledAt);
      return dateCmp !== 0 ? dateCmp : a.id - b.id;
    });

    let counter = 0;
    let guaranteed: boolean | null = null;
    for (const pull of poolPulls) {
      counter += pull.quantity;
      if (pull.pityAtPull != null) {
        pool.history.push({
          pullId: pull.id,
          bannerId: pull.bannerId,
          pityAtPull: pull.pityAtPull,
          fiftyFiftyResult: pull.fiftyFiftyResult,
          pulledAt: pull.pulledAt,
        });
        counter = 0;
        if (pool.fiftyFifty) guaranteed = pull.fiftyFiftyResult === "lost";
      }
    }
    pool.currentPity = counter;
    pool.guaranteed = pool.fiftyFifty ? guaranteed : null;
  }

  return Array.from(pools.values());
}
