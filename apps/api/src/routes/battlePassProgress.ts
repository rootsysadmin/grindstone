import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { battlePassProgress } from "../db/schema.js";

type GameParams = { game: string };

/**
 * Singleton per game — your own live battle-pass progress, not config (see
 * schema.ts's comment on why this isn't folded into game_settings). Unlike
 * game_settings, nothing seeds this, so GET creates a default row on first
 * read rather than 404ing.
 */
export async function battlePassProgressRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/battle-pass", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const { game } = req.params;
    const [row] = await db.select().from(battlePassProgress).where(eq(battlePassProgress.gameId, game));
    if (row) return row;
    const [created] = (await db.insert(battlePassProgress).values({ gameId: game }).returning()) as any[];
    return created;
  });

  app.put(
    "/api/games/:game/battle-pass",
    async (
      req: FastifyRequest<{ Params: GameParams; Body: { currentLevel: number; maxLevel: number; endDate: string | null } }>,
    ) => {
      const { game } = req.params;
      const values = {
        currentLevel: Math.max(0, Number(req.body.currentLevel) || 0),
        maxLevel: Math.max(1, Number(req.body.maxLevel) || 1),
        endDate: req.body.endDate,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      const [existing] = await db.select({ id: battlePassProgress.id }).from(battlePassProgress).where(eq(battlePassProgress.gameId, game));
      if (existing) {
        await db.update(battlePassProgress).set(values).where(eq(battlePassProgress.id, existing.id));
      } else {
        await db.insert(battlePassProgress).values({ gameId: game, ...values });
      }
      const [row] = await db.select().from(battlePassProgress).where(eq(battlePassProgress.gameId, game));
      return row;
    },
  );
}
