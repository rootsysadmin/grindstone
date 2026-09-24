// Stage 4 — pull log & pity engine API shapes. Same category as planner.ts:
// plain interfaces, not entityConfigs-driven, since pull_log is user-state
// (not a master-data catalog row).

export type PullLogItemType = "character" | "equipment" | "other";
export type FiftyFiftyResult = "won" | "lost" | "n/a";

export interface PullLogRow {
  id: number;
  bannerId: number;
  rank: string | null;
  itemType: PullLogItemType;
  itemId: number | null;
  itemName: string;
  quantity: number;
  pityAtPull: number | null;
  fiftyFiftyResult: FiftyFiftyResult | null;
  pulledAt: string;
  notes: string | null;
  createdAt: number;
}

/** One pity-relevant (top-rank) pull, ordered within a pool's history. */
export interface PityHistoryEntry {
  pullId: number;
  bannerId: number;
  pityAtPull: number;
  fiftyFiftyResult: FiftyFiftyResult | null;
  pulledAt: string;
}

/**
 * One pity-tracking pool's current state — see apps/api/src/core/pityEngine.ts.
 * `guaranteed` is null when the pool doesn't track 50/50 at all (N2E's case,
 * always), not just "unknown."
 */
export interface PityPoolState {
  poolKey: string;
  type: string | null;
  bannerIds: number[];
  fiftyFifty: boolean;
  currentPity: number;
  guaranteed: boolean | null;
  history: PityHistoryEntry[];
}
