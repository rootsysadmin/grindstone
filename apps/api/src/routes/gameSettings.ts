import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { gameSettings } from "../db/schema.js";

type GameParams = { game: string };

/**
 * Per-game numeric progression ceilings (character/skill/equipment level
 * caps, resonance level count) — a single row per game, editable without a
 * rebuild. See db/schema.ts's gameSettings table for why this is a real DB
 * row instead of static config.ts values.
 */
export async function gameSettingsRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/settings", async (req: FastifyRequest<{ Params: GameParams }>, reply) => {
    const [row] = await db.select().from(gameSettings).where(eq(gameSettings.gameId, req.params.game));
    if (!row) return reply.code(404).send({ error: "No game settings seeded for this game" });
    return row;
  });

  app.patch(
    "/api/games/:game/settings",
    async (
      req: FastifyRequest<{
        Params: GameParams;
        Body: Partial<{
          maxCharacterLevel: number;
          maxSkillLevel: number;
          maxEquipmentLevel: number;
          maxResonanceLevel: number;
        }>;
      }>,
      reply,
    ) => {
      const [row] = (await db
        .update(gameSettings)
        .set(req.body)
        .where(eq(gameSettings.gameId, req.params.game))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "No game settings seeded for this game" });
      return row;
    },
  );
}
