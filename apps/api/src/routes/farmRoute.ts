import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { farmRouteEntries } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/** Flat CRUD for the manual farm-planning list, plus a reorder action for drag-and-drop. */
export async function farmRouteRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/farm-route", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db
      .select()
      .from(farmRouteEntries)
      .where(eq(farmRouteEntries.gameId, req.params.game))
      .orderBy(asc(farmRouteEntries.sortOrder));
  });

  app.post(
    "/api/games/:game/farm-route",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(farmRouteEntries)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/farm-route/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(farmRouteEntries)
        .set(req.body)
        .where(and(eq(farmRouteEntries.gameId, req.params.game), eq(farmRouteEntries.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/farm-route/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db
      .delete(farmRouteEntries)
      .where(and(eq(farmRouteEntries.gameId, req.params.game), eq(farmRouteEntries.id, Number(req.params.id))));
    return { ok: true };
  });

  app.post(
    "/api/games/:game/farm-route/reorder",
    async (req: FastifyRequest<{ Params: GameParams; Body: { ids: number[] } }>) => {
      const { game } = req.params;
      for (const [i, id] of req.body.ids.entries()) {
        await db
          .update(farmRouteEntries)
          .set({ sortOrder: i })
          .where(and(eq(farmRouteEntries.gameId, game), eq(farmRouteEntries.id, id)));
      }
      return { ok: true };
    },
  );
}
