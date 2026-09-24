// Static registry mapping every installed game's slug to its config module.
// Values (terms, elements, currencies...) live only in games/<slug>/config.ts
// — this file just knows *which* configs exist, so it doesn't itself
// contain any game-specific facts. See root CLAUDE.md's "Context isolation"
// note. Which game is *active* at any moment is UI state, not a constant —
// see ../../state/gameContext.tsx.
import type { GameConfig } from "@grindstone/shared";
import { gameConfig as nteConfig } from "../../../../../games/neverness-to-everness/config";
import { gameConfig as wuwaConfig } from "../../../../../games/wuthering-waves/config";

export const gameConfigsBySlug: Record<string, GameConfig> = {
  [nteConfig.slug]: nteConfig,
  [wuwaConfig.slug]: wuwaConfig,
};
