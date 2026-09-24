import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { wishlistTargets } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/**
 * Flat CRUD for pull targets, plus a reorder action (priority, 1 = highest —
 * same drag-reorder shape as farm_route_entries.sortOrder) and two small
 * status actions. Most of a target's derived state (obtained/expired,
 * affordability) is computed client-side in wishlistData.ts from real
 * pull_log/banner/inventory data — this table only stores what can't be
 * derived: priority, budget, and the manual deferred/locked acknowledgments.
 */
export async function wishlistRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/wishlist-targets", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(wishlistTargets).where(eq(wishlistTargets.gameId, req.params.game)).orderBy(asc(wishlistTargets.priority));
  });

  app.post(
    "/api/games/:game/wishlist-targets",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(wishlistTargets)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/wishlist-targets/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(wishlistTargets)
        .set(req.body)
        .where(and(eq(wishlistTargets.gameId, req.params.game), eq(wishlistTargets.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/wishlist-targets/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(wishlistTargets).where(and(eq(wishlistTargets.gameId, req.params.game), eq(wishlistTargets.id, Number(req.params.id))));
    return { ok: true };
  });

  app.post(
    "/api/games/:game/wishlist-targets/reorder",
    async (req: FastifyRequest<{ Params: GameParams; Body: { ids: number[] } }>) => {
      const { game } = req.params;
      for (const [i, id] of req.body.ids.entries()) {
        await db
          .update(wishlistTargets)
          .set({ priority: i + 1 })
          .where(and(eq(wishlistTargets.gameId, game), eq(wishlistTargets.id, id)));
      }
      return { ok: true };
    },
  );

  // Used by the remove-from-wishlist confirm dialog (REMOVE -> "deferred")
  // and available as a manual correction if the read-time derived
  // obtained/expired status ever needs overriding.
  app.patch(
    "/api/games/:game/wishlist-targets/:id/status",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: { status: "active" | "obtained" | "expired" | "deferred" } }>, reply) => {
      const [row] = (await db
        .update(wishlistTargets)
        .set({ status: req.body.status, resolvedAt: req.body.status === "active" ? null : Math.floor(Date.now() / 1000) })
        .where(and(eq(wishlistTargets.gameId, req.params.game), eq(wishlistTargets.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  // LOCK PLAN — records an acknowledgment of the current advisor verdict.
  // Purely informational: nothing else in the app reads or enforces it.
  app.patch(
    "/api/games/:game/wishlist-targets/:id/lock",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: { decision: "pull" | "hold" | "skip" } }>, reply) => {
      const [row] = (await db
        .update(wishlistTargets)
        .set({ lockedDecision: req.body.decision, lockedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(wishlistTargets.gameId, req.params.game), eq(wishlistTargets.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );
}
