import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { savingsRuleOverrides, savingsRules } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/** Flat CRUD for the fixed-kind savings rules (see schema.ts's comment on savingsRules), a reorder action, and the override log. */
export async function savingsRuleRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/savings-rules", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(savingsRules).where(eq(savingsRules.gameId, req.params.game)).orderBy(asc(savingsRules.sortOrder));
  });

  app.post(
    "/api/games/:game/savings-rules",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(savingsRules)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/savings-rules/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(savingsRules)
        .set(req.body)
        .where(and(eq(savingsRules.gameId, req.params.game), eq(savingsRules.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/savings-rules/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(savingsRules).where(and(eq(savingsRules.gameId, req.params.game), eq(savingsRules.id, Number(req.params.id))));
    return { ok: true };
  });

  app.post(
    "/api/games/:game/savings-rules/reorder",
    async (req: FastifyRequest<{ Params: GameParams; Body: { ids: number[] } }>) => {
      const { game } = req.params;
      for (const [i, id] of req.body.ids.entries()) {
        await db.update(savingsRules).set({ sortOrder: i }).where(and(eq(savingsRules.gameId, game), eq(savingsRules.id, id)));
      }
      return { ok: true };
    },
  );

  app.get("/api/games/:game/savings-rule-overrides", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(savingsRuleOverrides).where(eq(savingsRuleOverrides.gameId, req.params.game));
  });

  app.post(
    "/api/games/:game/savings-rules/:id/override",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: { targetId?: number; note?: string } }>) => {
      const [row] = (await db
        .insert(savingsRuleOverrides)
        .values({ gameId: req.params.game, ruleId: Number(req.params.id), targetId: req.body.targetId ?? null, note: req.body.note ?? null })
        .returning()) as any[];
      return row;
    },
  );

  app.delete("/api/games/:game/savings-rule-overrides/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(savingsRuleOverrides).where(and(eq(savingsRuleOverrides.gameId, req.params.game), eq(savingsRuleOverrides.id, Number(req.params.id))));
    return { ok: true };
  });
}
