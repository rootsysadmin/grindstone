import type { FastifyInstance, FastifyRequest } from "fastify";
import { desc, eq } from "drizzle-orm";
import type { UpdatePayload } from "@grindstone/shared";
import { db } from "../db/client.js";
import { syncRuns, syncSettings } from "../db/schema.js";
import { applyManualUpdate, getSyncSettings, runCommunitySync } from "../core/updateSync.js";

type GameParams = { game: string };

/**
 * Stage 10 — community-sourced update sync. sync-settings is deliberately
 * NOT nested under /games/:game — the data repo is one app-wide setting
 * covering every game (each in its own games/<slug>/ folder in that repo),
 * same as the app itself only has one CLAUDE.md pointing at many games/*.
 */
export async function syncRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/sync/status", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const [lastRun] = await db.select().from(syncRuns).where(eq(syncRuns.gameId, req.params.game)).orderBy(desc(syncRuns.createdAt)).limit(1);
    return { lastRun: lastRun ?? null };
  });

  app.post("/api/games/:game/sync/community", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return runCommunitySync(req.params.game);
  });

  app.post(
    "/api/games/:game/sync/apply",
    async (req: FastifyRequest<{ Params: GameParams; Body: UpdatePayload }>) => {
      return applyManualUpdate(req.params.game, req.body);
    },
  );

  app.get("/api/sync-settings", async () => {
    const row = await getSyncSettings();
    return row ?? { dataRepoOwner: null, dataRepoName: null };
  });

  app.patch(
    "/api/sync-settings",
    async (req: FastifyRequest<{ Body: { dataRepoOwner?: string | null; dataRepoName?: string | null } }>) => {
      const [existing] = await db.select({ id: syncSettings.id }).from(syncSettings);
      if (existing) {
        await db.update(syncSettings).set(req.body).where(eq(syncSettings.id, existing.id));
      } else {
        await db.insert(syncSettings).values(req.body);
      }
      const [row] = await db.select().from(syncSettings);
      return row;
    },
  );
}
