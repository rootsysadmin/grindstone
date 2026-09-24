import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { taskProgress, tasks } from "../db/schema.js";
import { adjustInventory } from "../core/inventory.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/**
 * Flat CRUD for the checklist items themselves, plus a progress endpoint
 * that's the "real event, real credit" counterpart to Stage 3's income
 * claims: incrementing a task's current-period progress credits its reward
 * to inventory immediately (delta * rewardQuantity, so a count task like
 * "Hunter's Crucible 3/5" credits per repetition, not once at the end);
 * decrementing debits it back the same way.
 */
export async function taskRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/tasks", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(tasks).where(eq(tasks.gameId, req.params.game)).orderBy(asc(tasks.sortOrder));
  });

  app.post(
    "/api/games/:game/tasks",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> }>) => {
      const [row] = (await db
        .insert(tasks)
        .values({ gameId: req.params.game, ...req.body } as any)
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/tasks/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> }>, reply) => {
      const [row] = (await db
        .update(tasks)
        .set(req.body)
        .where(and(eq(tasks.gameId, req.params.game), eq(tasks.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/tasks/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    const { game } = req.params;
    const id = Number(req.params.id);
    await db.delete(taskProgress).where(and(eq(taskProgress.gameId, game), eq(taskProgress.taskId, id)));
    await db.delete(tasks).where(and(eq(tasks.gameId, game), eq(tasks.id, id)));
    return { ok: true };
  });

  // Every progress row for the game, flat — the frontend derives streaks
  // and daily/weekly history from this plus each task's cadence.
  app.get("/api/games/:game/task-progress", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(taskProgress).where(eq(taskProgress.gameId, req.params.game));
  });

  app.patch(
    "/api/games/:game/tasks/:id/progress",
    async (
      req: FastifyRequest<{ Params: GameIdParams; Body: { periodKey: string; current: number } }>,
      reply,
    ) => {
      const { game } = req.params;
      const id = Number(req.params.id);
      const { periodKey } = req.body;
      const current = Math.max(0, Number(req.body.current) || 0);

      const [task] = await db.select().from(tasks).where(and(eq(tasks.gameId, game), eq(tasks.id, id)));
      if (!task) return reply.code(404).send({ error: "Not found" });

      const [existing] = await db
        .select()
        .from(taskProgress)
        .where(and(eq(taskProgress.taskId, id), eq(taskProgress.periodKey, periodKey)));
      const previous = existing?.current ?? 0;
      const updatedAt = Math.floor(Date.now() / 1000);

      if (existing) {
        await db.update(taskProgress).set({ current, updatedAt }).where(eq(taskProgress.id, existing.id));
      } else {
        await db.insert(taskProgress).values({ gameId: game, taskId: id, periodKey, current, updatedAt });
      }

      const delta = current - previous;
      if (task.rewardKind && task.rewardQuantity != null && delta !== 0) {
        const rewardId = task.rewardKind === "currency" ? task.rewardCurrencyId : task.rewardMaterialId;
        if (rewardId != null) await adjustInventory(game, task.rewardKind, rewardId, delta * task.rewardQuantity);
      }

      const [row] = await db
        .select()
        .from(taskProgress)
        .where(and(eq(taskProgress.taskId, id), eq(taskProgress.periodKey, periodKey)));
      return row;
    },
  );
}
