import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { spendBudgetOverrides, spendBudgets, spendGameSettings } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/**
 * Flat CRUD for advisory spend caps (platform-wide and per-game monthly
 * caps, plus the single-purchase ceiling — all `spend_budgets` rows,
 * distinguished by `kind` and a nullable `gameId`), an override log
 * mirroring savings_rule_overrides, and the per-game spend settings
 * singleton (auto-created on first GET, same shape as battlePassProgress.ts).
 */
export async function spendBudgetRoutes(app: FastifyInstance) {
  // Platform-wide rows (gameId null) plus this game's own rows — a budget
  // isn't necessarily scoped to one game, see schema.ts's comment.
  app.get("/api/games/:game/spend-budgets", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const { game } = req.params;
    return db.select().from(spendBudgets).where(or(isNull(spendBudgets.gameId), eq(spendBudgets.gameId, game)));
  });

  app.post(
    "/api/games/:game/spend-budgets",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(spendBudgets)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/spend-budgets/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(spendBudgets)
        .set(req.body)
        .where(eq(spendBudgets.id, Number(req.params.id)))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/spend-budgets/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(spendBudgets).where(eq(spendBudgets.id, Number(req.params.id)));
    return { ok: true };
  });

  app.get("/api/games/:game/spend-budget-overrides", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(spendBudgetOverrides).where(eq(spendBudgetOverrides.gameId, req.params.game));
  });

  app.post(
    "/api/games/:game/spend-budget-overrides",
    async (req: FastifyRequest<{ Params: GameParams; Body: { budgetId: number; note?: string } }>) => {
      const [row] = (await db
        .insert(spendBudgetOverrides)
        .values({ gameId: req.params.game, budgetId: req.body.budgetId, note: req.body.note ?? null })
        .returning()) as any[];
      return row;
    },
  );

  app.get("/api/games/:game/spend-settings", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const { game } = req.params;
    const [row] = await db.select().from(spendGameSettings).where(eq(spendGameSettings.gameId, game));
    if (row) return row;
    const [created] = (await db.insert(spendGameSettings).values({ gameId: game }).returning()) as any[];
    return created;
  });

  app.patch(
    "/api/games/:game/spend-settings",
    async (
      req: FastifyRequest<{
        Params: GameParams;
        Body: Partial<{ quitAt: number | null; warnOnLost5050: boolean; warnRecentPurchase: boolean }>;
      }>,
    ) => {
      const { game } = req.params;
      const [existing] = await db.select({ id: spendGameSettings.id }).from(spendGameSettings).where(eq(spendGameSettings.gameId, game));
      if (existing) {
        await db.update(spendGameSettings).set(req.body).where(eq(spendGameSettings.id, existing.id));
      } else {
        await db.insert(spendGameSettings).values({ gameId: game, ...req.body });
      }
      const [row] = await db.select().from(spendGameSettings).where(eq(spendGameSettings.gameId, game));
      return row;
    },
  );
}
