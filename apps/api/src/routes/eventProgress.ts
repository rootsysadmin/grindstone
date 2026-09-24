import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { eventProgress, eventRewards, events } from "../db/schema.js";
import { adjustInventory } from "../core/inventory.js";

type GameParams = { game: string };

/**
 * Per-event "how many stages have I cleared" — upserted on write, mirrors
 * inventory.ts. Events with a real reward attached (eventRewards) credit
 * that reward, once, the moment progress crosses the event's completion
 * target (stageCount if set, else 1 — a plain "claimed" checkbox) — the
 * same "real event, real credit" rule tasks/progress already follows, but
 * as a lump sum on completion rather than per-increment, since an event's
 * reward is a flat "for finishing this" amount, not a per-stage rate.
 * Un-completing (decrementing back below target) debits it back
 * symmetrically, same as tasks. Events with no reward and no stageCount
 * have nothing to credit or track — the frontend treats those as
 * always-done rather than perpetually-incomplete (see calendarData.ts).
 */
export async function eventProgressRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/event-progress", async (req: FastifyRequest<{ Params: GameParams }>) => {
    return db.select().from(eventProgress).where(eq(eventProgress.gameId, req.params.game));
  });

  app.put(
    "/api/games/:game/event-progress/:eventId",
    async (req: FastifyRequest<{ Params: GameParams & { eventId: string }; Body: { current: number } }>, reply) => {
      const { game } = req.params;
      const eventId = Number(req.params.eventId);
      const current = Math.max(0, Number(req.body.current) || 0);

      const [event] = await db.select().from(events).where(and(eq(events.gameId, game), eq(events.id, eventId)));
      if (!event) return reply.code(404).send({ error: "Not found" });

      const existing = await db
        .select({ id: eventProgress.id, current: eventProgress.current })
        .from(eventProgress)
        .where(and(eq(eventProgress.gameId, game), eq(eventProgress.eventId, eventId)));
      const previous = existing[0]?.current ?? 0;
      const updatedAt = Math.floor(Date.now() / 1000);

      if (existing[0]) {
        await db.update(eventProgress).set({ current, updatedAt }).where(eq(eventProgress.id, existing[0].id));
      } else {
        await db.insert(eventProgress).values({ gameId: game, eventId, current, updatedAt });
      }

      const target = event.stageCount ?? 1;
      const wasDone = previous >= target;
      const isDone = current >= target;
      if (isDone !== wasDone) {
        const rewardRows = await db.select().from(eventRewards).where(and(eq(eventRewards.gameId, game), eq(eventRewards.eventId, eventId)));
        const sign = isDone ? 1 : -1;
        for (const r of rewardRows) {
          const rewardId = r.kind === "currency" ? r.currencyId : r.materialId;
          if (rewardId != null && r.quantity != null) await adjustInventory(game, r.kind, rewardId, sign * r.quantity);
        }
      }

      const [row] = await db
        .select()
        .from(eventProgress)
        .where(and(eq(eventProgress.gameId, game), eq(eventProgress.eventId, eventId)));
      return row;
    },
  );
}
