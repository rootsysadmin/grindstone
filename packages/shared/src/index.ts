export type GameSlug = string;

export interface HealthResponse {
  status: "ok";
  game: GameSlug;
}

export * from "./masterData.js";
export * from "./gameConfig.js";
export * from "./roster.js";
export * from "./gameSettings.js";
export * from "./planner.js";
export * from "./pullLog.js";
export * from "./today.js";
export * from "./wishlist.js";
export * from "./spend.js";
export * from "./sync.js";
