import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GameConfig } from "@grindstone/shared";
import { gameConfigsBySlug } from "../features/master-data/gameConfigRegistry.ts";

const STORAGE_KEY = "grindstone.activeGame";

interface GameContextValue {
  slug: string;
  config: GameConfig;
  allConfigs: GameConfig[];
  setSlug: (slug: string) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function initialSlug(): string {
  const known = Object.keys(gameConfigsBySlug);
  if (known.length === 0) throw new Error("No games registered in gameConfigsBySlug");
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && known.includes(stored) ? stored : known[0]!;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [slug, setSlugState] = useState<string>(initialSlug);

  function setSlug(next: string) {
    setSlugState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo<GameContextValue>(() => {
    const config = gameConfigsBySlug[slug];
    if (!config) throw new Error(`Unknown game slug "${slug}"`);
    return { slug, config, allConfigs: Object.values(gameConfigsBySlug), setSlug };
  }, [slug]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/** The currently-selected game's config, plus a setter and the full registry — for the switcher. */
export function useActiveGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useActiveGame must be used within a GameProvider");
  return ctx;
}
