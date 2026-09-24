import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { banners, pullLog } from "../db/schema.js";
import { computePityState, type PityBanner, type PityPull } from "../core/pityEngine.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/** Flat CRUD, mirrors incomeSources.ts, plus a computed /pity endpoint backed by core/pityEngine.ts. */
export async function pullLogRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/pull-log", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db
      .select()
      .from(pullLog)
      .where(eq(pullLog.gameId, req.params.game))
      .orderBy(desc(pullLog.pulledAt), desc(pullLog.id));
  });

  app.post(
    "/api/games/:game/pull-log",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(pullLog)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/pull-log/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(pullLog)
        .set(req.body)
        .where(and(eq(pullLog.gameId, req.params.game), eq(pullLog.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/pull-log/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(pullLog).where(and(eq(pullLog.gameId, req.params.game), eq(pullLog.id, Number(req.params.id))));
    return { ok: true };
  });

  app.get("/api/games/:game/pull-log/pity", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const game = req.params.game;
    const bannerRows = await db.select().from(banners).where(eq(banners.gameId, game));
    const pullRows = await db.select().from(pullLog).where(eq(pullLog.gameId, game));

    const pityBanners: PityBanner[] = bannerRows.map((b) => ({
      id: b.id,
      type: b.type,
      carriesPity: b.carriesPity,
      fiftyFifty: b.fiftyFifty,
    }));
    const pityPulls: PityPull[] = pullRows.map((p) => ({
      id: p.id,
      bannerId: p.bannerId,
      quantity: p.quantity,
      pityAtPull: p.pityAtPull,
      fiftyFiftyResult: p.fiftyFiftyResult,
      pulledAt: p.pulledAt,
    }));

    return computePityState(pityBanners, pityPulls);
  });
}
