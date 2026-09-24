import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { characterBuilds, characterSkillLevels, characterStatTargets, characters, ownedAugments } from "../db/schema.js";
import { findImageUrl } from "../core/images.js";

type GameParams = { game: string };
type GameCharacterParams = { game: string; characterId: string };

/**
 * Roster read/write — deliberately returns *raw* state (build row, equipped
 * augment count, per-skill levels, stat targets), not a computed build %.
 * The ring math lives client-side (apps/web/src/features/roster/buildProgress.ts)
 * because it needs each game's numeric caps (maxCharacterLevel, etc.), and
 * those live in games/<slug>/config.ts — importable from apps/web (Vite/
 * Bundler resolution) but not cleanly from apps/api (NodeNext + a `rootDir:
 * "src"` build that config.ts sits outside of). Computing on the client
 * that already has the config loaded avoids that entirely.
 */
export async function rosterRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/roster", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const { game } = req.params;
    const rows = await db.select().from(characters).where(eq(characters.gameId, game));
    const builds = await db.select().from(characterBuilds).where(eq(characterBuilds.gameId, game));
    const buildByChar = new Map(builds.map((b) => [b.characterId, b]));
    const augments = await db.select().from(ownedAugments).where(eq(ownedAugments.gameId, game));
    const skillLevelRows = await db.select().from(characterSkillLevels).where(eq(characterSkillLevels.gameId, game));
    const statRows = await db.select().from(characterStatTargets).where(eq(characterStatTargets.gameId, game));

    return rows.map((c) => ({
      character: {
        id: c.id,
        slug: c.slug,
        name: c.name,
        rankTierId: c.rankTierId,
        elementId: c.elementId,
        role: c.role,
        maxAugmentSlots: c.maxAugmentSlots,
        imageUrl: findImageUrl(game, "characters", c.slug),
      },
      build: buildByChar.get(c.id) ?? null,
      equippedAugmentCount: augments.filter((a) => a.characterId === c.id).length,
      skillLevels: skillLevelRows.filter((s) => s.characterId === c.id).map((s) => ({ skillId: s.skillId, level: s.level })),
      statTargets: statRows.filter((s) => s.characterId === c.id),
    }));
  });

  app.put(
    "/api/games/:game/roster/:characterId",
    async (
      req: FastifyRequest<{
        Params: GameCharacterParams;
        Body: {
          level: number;
          resonanceLevel: number;
          equippedEquipmentItemId: number | null;
          equippedEquipmentLevel: number | null;
          equippedEquipmentRefinement: number | null;
          notes: string | null;
          skillLevels: { skillId: number; level: number }[];
        };
      }>,
    ) => {
      const { game } = req.params;
      const characterId = Number(req.params.characterId);
      const body = req.body;

      const existing = await db
        .select({ id: characterBuilds.id })
        .from(characterBuilds)
        .where(and(eq(characterBuilds.gameId, game), eq(characterBuilds.characterId, characterId)));

      const values = {
        level: body.level,
        resonanceLevel: body.resonanceLevel,
        equippedEquipmentItemId: body.equippedEquipmentItemId,
        equippedEquipmentLevel: body.equippedEquipmentLevel,
        equippedEquipmentRefinement: body.equippedEquipmentRefinement,
        notes: body.notes,
        updatedAt: Math.floor(Date.now() / 1000),
      };

      if (existing[0]) {
        await db.update(characterBuilds).set(values).where(eq(characterBuilds.id, existing[0].id));
      } else {
        await db.insert(characterBuilds).values({ gameId: game, characterId, ...values });
      }

      // Full replace of this character's skill levels — simplest correct
      // behavior for a single "save the whole build" action.
      await db
        .delete(characterSkillLevels)
        .where(and(eq(characterSkillLevels.gameId, game), eq(characterSkillLevels.characterId, characterId)));
      for (const s of body.skillLevels) {
        if (s.level > 0) {
          await db.insert(characterSkillLevels).values({ gameId: game, characterId, skillId: s.skillId, level: s.level });
        }
      }

      const [build] = await db
        .select()
        .from(characterBuilds)
        .where(and(eq(characterBuilds.gameId, game), eq(characterBuilds.characterId, characterId)));
      return build;
    },
  );

  // Separate from the PUT above (a full build replace) so pinning never
  // risks clobbering the rest of a build, and vice versa.
  app.patch(
    "/api/games/:game/roster/:characterId/pin",
    async (req: FastifyRequest<{ Params: GameCharacterParams; Body: { pinned: boolean } }>, reply) => {
      const { game } = req.params;
      const characterId = Number(req.params.characterId);
      const existing = await db
        .select({ id: characterBuilds.id })
        .from(characterBuilds)
        .where(and(eq(characterBuilds.gameId, game), eq(characterBuilds.characterId, characterId)));
      if (!existing[0]) return reply.code(404).send({ error: "Not owned" });
      await db.update(characterBuilds).set({ pinned: req.body.pinned }).where(eq(characterBuilds.id, existing[0].id));
      const [build] = await db.select().from(characterBuilds).where(eq(characterBuilds.id, existing[0].id));
      return build;
    },
  );

  app.delete("/api/games/:game/roster/:characterId", async (req: FastifyRequest<{ Params: GameCharacterParams }>) => {
    const { game } = req.params;
    const characterId = Number(req.params.characterId);
    // Un-owning a character also frees whatever it had equipped, so those
    // augments go back to "in bag" instead of pointing at a build that no
    // longer exists.
    await db
      .update(ownedAugments)
      .set({ characterId: null, slotIndex: null })
      .where(and(eq(ownedAugments.gameId, game), eq(ownedAugments.characterId, characterId)));
    await db
      .delete(characterSkillLevels)
      .where(and(eq(characterSkillLevels.gameId, game), eq(characterSkillLevels.characterId, characterId)));
    await db
      .delete(characterBuilds)
      .where(and(eq(characterBuilds.gameId, game), eq(characterBuilds.characterId, characterId)));
    return { ok: true };
  });
}
