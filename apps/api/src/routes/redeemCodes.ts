import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { codeRewards, redeemCodes } from "../db/schema.js";
import { adjustInventory } from "../core/inventory.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

async function rewardsByCodeId(codeIds: number[]) {
  if (codeIds.length === 0) return new Map<number, { id: number; kind: string; currencyId: number | null; materialId: number | null; quantity: number | null }[]>();
  const rows = await db.select().from(codeRewards).where(inArray(codeRewards.codeId, codeIds));
  const map = new Map<number, typeof rows>();
  for (const r of rows) map.set(r.codeId, [...(map.get(r.codeId) ?? []), r]);
  return map;
}

/**
 * Flat CRUD, mirrors farmRoute.ts. A personal running list — see schema.ts's
 * comment on redeem_codes for why this isn't master data. `rewards` (see
 * code_rewards) is embedded on GET the same way purchases.ts embeds
 * purchase_grants; marking a code redeemed credits every reward row to real
 * inventory via adjustInventory, the same real-event-real-credit rule
 * event_rewards already runs on (apps/api/src/routes/eventProgress.ts) —
 * un-redeeming debits it back symmetrically. This wasn't true before the
 * Stage 10 follow-up (see docs/progress.md) — redeem codes never credited
 * anything, `rewardLabel` was decorative text only, and stays that way for
 * codes added through the compact quick-add form (no rewards attached);
 * only codes carrying real code_rewards rows (added via Log Update) credit
 * anything on redeem.
 */
export async function redeemCodeRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/redeem-codes", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const rows = await db.select().from(redeemCodes).where(eq(redeemCodes.gameId, req.params.game)).orderBy(desc(redeemCodes.createdAt));
    const rewardsById = await rewardsByCodeId(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, rewards: rewardsById.get(r.id) ?? [] }));
  });

  app.post(
    "/api/games/:game/redeem-codes",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(redeemCodes)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return { ...row, rewards: [] };
    },
  );

  app.patch(
    "/api/games/:game/redeem-codes/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const { game } = req.params;
      const id = Number(req.params.id);
      const [before] = await db.select().from(redeemCodes).where(and(eq(redeemCodes.gameId, game), eq(redeemCodes.id, id)));
      if (!before) return reply.code(404).send({ error: "Not found" });

      const [row] = (await db.update(redeemCodes).set(req.body).where(eq(redeemCodes.id, id)).returning()) as any[];

      if ("redeemed" in req.body && Boolean(before.redeemed) !== Boolean(row.redeemed)) {
        const rewards = await db.select().from(codeRewards).where(eq(codeRewards.codeId, id));
        const sign = row.redeemed ? 1 : -1;
        for (const r of rewards) {
          const rewardId = r.kind === "currency" ? r.currencyId : r.materialId;
          if (rewardId != null && r.quantity != null) await adjustInventory(game, r.kind as "currency" | "material", rewardId, sign * r.quantity);
        }
      }

      const rewards = await db.select().from(codeRewards).where(eq(codeRewards.codeId, id));
      return { ...row, rewards };
    },
  );

  app.delete("/api/games/:game/redeem-codes/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    const id = Number(req.params.id);
    await db.delete(codeRewards).where(eq(codeRewards.codeId, id));
    await db.delete(redeemCodes).where(and(eq(redeemCodes.gameId, req.params.game), eq(redeemCodes.id, id)));
    return { ok: true };
  });
}
