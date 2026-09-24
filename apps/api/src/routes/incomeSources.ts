import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { currencyInventory, incomeClaims, incomeSources } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/** Flat CRUD, mirrors teams.ts. Not master data — see schema.ts's comment on the table (cadence/amount are real facts, but `enabled`/reliability are the player's own call). */
export async function incomeSourceRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/income-sources", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(incomeSources).where(eq(incomeSources.gameId, req.params.game));
  });

  app.post(
    "/api/games/:game/income-sources",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(incomeSources)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/income-sources/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(incomeSources)
        .set({ ...req.body, updatedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(incomeSources.gameId, req.params.game), eq(incomeSources.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/income-sources/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db
      .delete(incomeSources)
      .where(and(eq(incomeSources.gameId, req.params.game), eq(incomeSources.id, Number(req.params.id))));
    return { ok: true };
  });

  // Every claim in the game, flat — the frontend derives "claimed this
  // period" per source from this plus each source's cadence/intervalDays
  // (see planner/materialNeeds.ts's isClaimedThisPeriod).
  app.get("/api/games/:game/income-claims", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(incomeClaims).where(eq(incomeClaims.gameId, req.params.game));
  });

  // Logs a real claim and immediately credits the source's currency —
  // actual balance, not a projection. See schema.ts's comment on
  // income_claims for why this is separate from the `enabled` toggle.
  app.post(
    "/api/games/:game/income-sources/:id/claim",
    async (req: FastifyRequest<{ Params: GameIdParams }>, reply) => {
      const { game } = req.params;
      const id = Number(req.params.id);
      const [source] = await db
        .select()
        .from(incomeSources)
        .where(and(eq(incomeSources.gameId, game), eq(incomeSources.id, id)));
      if (!source) return reply.code(404).send({ error: "Not found" });

      const [claim] = (await db
        .insert(incomeClaims)
        .values({ gameId: game, incomeSourceId: id })
        .returning()) as any[];

      const amount = source.amountPerEvent ?? 0;
      const existing = await db
        .select({ id: currencyInventory.id, balance: currencyInventory.balance })
        .from(currencyInventory)
        .where(and(eq(currencyInventory.gameId, game), eq(currencyInventory.currencyId, source.currencyId)));
      const updatedAt = Math.floor(Date.now() / 1000);
      if (existing[0]) {
        await db
          .update(currencyInventory)
          .set({ balance: existing[0].balance + amount, updatedAt })
          .where(eq(currencyInventory.id, existing[0].id));
      } else {
        await db.insert(currencyInventory).values({ gameId: game, currencyId: source.currencyId, balance: amount, updatedAt });
      }

      const [balanceRow] = await db
        .select()
        .from(currencyInventory)
        .where(and(eq(currencyInventory.gameId, game), eq(currencyInventory.currencyId, source.currencyId)));
      return { claim, balance: balanceRow };
    },
  );
}
