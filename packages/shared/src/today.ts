// Stage 5 — Today dashboard API shapes: dailies/weeklies, event progress,
// redeem codes, battle pass. Same category as planner.ts/pullLog.ts: plain
// interfaces, not entityConfigs-driven, since none of these are master-data
// catalog rows.

import type { CodeRewardRow } from "./sync.js";

export type TaskCadence = "daily" | "weekly" | "once";
export type TaskRewardKind = "currency" | "material";

export interface TaskRow {
  id: number;
  cadence: TaskCadence;
  label: string;
  target: number;
  rewardKind: TaskRewardKind | null;
  rewardCurrencyId: number | null;
  rewardMaterialId: number | null;
  rewardQuantity: number | null;
  forLabel: string | null;
  fromGame: boolean;
  sortOrder: number;
  createdAt: number;
}

/** One row per (task, reset period) — see apps/api/src/db/schema.ts's comment on task_progress for the periodKey shape. */
export interface TaskProgressRow {
  id: number;
  taskId: number;
  periodKey: string;
  current: number;
  updatedAt: number;
}

export interface EventProgressRow {
  id: number;
  eventId: number;
  current: number;
  updatedAt: number;
}

export interface RedeemCodeRow {
  id: number;
  code: string;
  rewardLabel: string | null;
  redeemed: boolean;
  source: "auto" | "manual" | "override";
  rewards: CodeRewardRow[];
  createdAt: number;
}

export interface BattlePassProgressRow {
  id: number;
  currentLevel: number;
  maxLevel: number;
  endDate: string | null;
  updatedAt: number;
}
