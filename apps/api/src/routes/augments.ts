import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { ownedAugments } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/**
 * CRUD for real owned Cartridge/Module (or Echo) instances — see
 * owned_augments in db/schema.ts for how this differs from module_targets
 * (an ideal, not a real pull). Equip/unequip live here too since they're
 * fundamentally an update to an augment's own characterId/slotIndex, not a
 * character-build field.
 */
export async function augmentRoutes(app: FastifyInstance) {
  app.get(
    "/api/games/:game/augments",
    async (req: FastifyRequest<{ Params: GameParams; Querystring: { moduleId?: string; characterId?: string; unequipped?: string } }>) => {
      const { game } = req.params;
      const conditions = [eq(ownedAugments.gameId, game)];
      if (req.query.moduleId) conditions.push(eq(ownedAugments.moduleId, Number(req.query.moduleId)));
      if (req.query.characterId) conditions.push(eq(ownedAugments.characterId, Number(req.query.characterId)));
      if (req.query.unequipped === "true") conditions.push(isNull(ownedAugments.characterId));
      return db
        .select()
        .from(ownedAugments)
        .where(and(...conditions));
    },
  );

  app.post(
    "/api/games/:game/augments",
    async (
      req: FastifyRequest<{
        Params: GameParams;
        Body: { moduleId: number; mainStat?: string | null; substats?: string | null; level?: number | null };
      }>,
    ) => {
      const [row] = (await db
        .insert(ownedAugments)
        .values({ gameId: req.params.game, ...req.body })
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/augments/:id",
    async (
      req: FastifyRequest<{
        Params: GameIdParams;
        Body: { mainStat?: string | null; substats?: string | null; level?: number | null };
      }>,
      reply,
    ) => {
      const [row] = (await db
        .update(ownedAugments)
        .set(req.body)
        .where(and(eq(ownedAugments.gameId, req.params.game), eq(ownedAugments.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/augments/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    await db.delete(ownedAugments).where(and(eq(ownedAugments.gameId, req.params.game), eq(ownedAugments.id, Number(req.params.id))));
    return { ok: true };
  });

  // Equips this augment to characterId/slotIndex, first bumping (unequipping)
  // whatever was already in that slot — this is the "slot-conflict" behavior
  // from the mockup's edit mode. Returns the bumped row, if any, so the UI
  // can surface what moved.
  app.post(
    "/api/games/:game/augments/:id/equip",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: { characterId: number; slotIndex: number } }>, reply) => {
      const { game } = req.params;
      const { characterId, slotIndex } = req.body;

      const [bumped] = (await db
        .update(ownedAugments)
        .set({ characterId: null, slotIndex: null })
        .where(
          and(
            eq(ownedAugments.gameId, game),
            eq(ownedAugments.characterId, characterId),
            eq(ownedAugments.slotIndex, slotIndex),
          ),
        )
        .returning()) as any[];

      const [row] = (await db
        .update(ownedAugments)
        .set({ characterId, slotIndex })
        .where(and(eq(ownedAugments.gameId, game), eq(ownedAugments.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return { augment: row, bumped: bumped ?? null };
    },
  );

  app.post("/api/games/:game/augments/:id/unequip", async (req: FastifyRequest<{ Params: GameIdParams }>, reply) => {
    const [row] = (await db
      .update(ownedAugments)
      .set({ characterId: null, slotIndex: null })
      .where(and(eq(ownedAugments.gameId, req.params.game), eq(ownedAugments.id, Number(req.params.id))))
      .returning()) as any[];
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });
}
