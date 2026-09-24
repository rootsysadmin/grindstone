import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  characterLevelCosts,
  characterStatTargets,
  equipmentLevelCosts,
  eventRewards,
  materialSources,
  moduleTargets,
  skillLevelCosts,
  teamMembers,
} from "../db/schema.js";

type GameParentParams = { game: string; parentId: string };

/**
 * Small, uniform CRUD for the "child rows of one parent" tables (material
 * sources, module targets, event rewards) — these aren't
 * top-level master-data tabs (no slug/source/status), so they don't go
 * through the generic entityConfigs-driven routes in masterData.ts. Kept
 * as one file since each is only a handful of lines.
 */
function registerChildRoutes<T extends { id: any; gameId: any }>(
  app: FastifyInstance,
  opts: {
    path: string; // e.g. "materials/:parentId/sources"
    table: T;
    parentColumn: keyof T;
    /** Also expose an unfiltered "every row for this game" GET at this path — needed when a caller (e.g. a cross-character rollup) has to aggregate across every parent at once instead of one at a time. Mirrors how `skills` already gets both a child-of-character view and a flat listing over the same table. */
    flatPath?: string; // e.g. "character-level-costs"
  },
) {
  const t = opts.table as any;
  const parentCol = t[opts.parentColumn];

  app.get(`/api/games/:game/${opts.path}`, async (req: FastifyRequest<{ Params: GameParentParams }>) => {
    return db
      .select()
      .from(t)
      .where(and(eq(t.gameId, req.params.game), eq(parentCol, Number(req.params.parentId))));
  });

  if (opts.flatPath) {
    app.get(`/api/games/:game/${opts.flatPath}`, async (req: FastifyRequest<{ Params: { game: string } }>) => {
      return db.select().from(t).where(eq(t.gameId, req.params.game));
    });
  }

  app.post(
    `/api/games/:game/${opts.path}`,
    async (req: FastifyRequest<{ Params: GameParentParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(t)
        .values({
          ...req.body,
          gameId: req.params.game,
          [opts.parentColumn]: Number(req.params.parentId),
        })
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    `/api/games/:game/${opts.path}/:id`,
    async (req: FastifyRequest<{ Params: GameParentParams & { id: string }; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(t)
        .set(req.body)
        .where(and(eq(t.gameId, req.params.game), eq(t.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete(
    `/api/games/:game/${opts.path}/:id`,
    async (req: FastifyRequest<{ Params: GameParentParams & { id: string } }>) => {
      await db.delete(t).where(and(eq(t.gameId, req.params.game), eq(t.id, Number(req.params.id))));
      return { ok: true };
    },
  );
}

export async function childRowRoutes(app: FastifyInstance) {
  registerChildRoutes(app, { path: "materials/:parentId/sources", table: materialSources, parentColumn: "materialId" });
  registerChildRoutes(app, {
    path: "modules/:parentId/targets",
    table: moduleTargets,
    parentColumn: "moduleId",
    // Needed to aggregate one character's whole Set (Cartridge + Modules)
    // across the entire catalog at once — see roster/moduleSet.ts.
    flatPath: "module-targets",
  });
  registerChildRoutes(app, { path: "events/:parentId/rewards", table: eventRewards, parentColumn: "eventId", flatPath: "event-rewards" });
  registerChildRoutes(app, { path: "characters/:parentId/stat-targets", table: characterStatTargets, parentColumn: "characterId" });
  registerChildRoutes(app, { path: "teams/:parentId/members", table: teamMembers, parentColumn: "teamId" });

  // Stage 3 — material cost schedules. Each needs a flat "every row for
  // this game" listing too, for the global Materials planner's cross-
  // character/weapon/skill rollup (see materialNeeds.ts on the frontend).
  registerChildRoutes(app, {
    path: "characters/:parentId/level-costs",
    table: characterLevelCosts,
    parentColumn: "characterId",
    flatPath: "character-level-costs",
  });
  registerChildRoutes(app, {
    path: "equipment-items/:parentId/level-costs",
    table: equipmentLevelCosts,
    parentColumn: "equipmentItemId",
    flatPath: "equipment-level-costs",
  });
  registerChildRoutes(app, {
    path: "skills/:parentId/level-costs",
    table: skillLevelCosts,
    parentColumn: "skillId",
    flatPath: "skill-level-costs",
  });
}
