import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { incomeSources, spendSubscriptions, subscriptionGrants } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };
type GrantInput = { kind: "currency" | "pulls"; currencyId?: number | null; amount: number };

async function grantsBySubscriptionId(subscriptionIds: number[]): Promise<Map<number, { id: number; kind: string; currencyId: number | null; amount: number }[]>> {
  if (subscriptionIds.length === 0) return new Map();
  const rows = await db.select().from(subscriptionGrants).where(inArray(subscriptionGrants.subscriptionId, subscriptionIds));
  const map = new Map<number, typeof rows>();
  for (const r of rows) map.set(r.subscriptionId, [...(map.get(r.subscriptionId) ?? []), r]);
  return map;
}

async function replaceGrants(subscriptionId: number, grants: GrantInput[] | undefined) {
  if (grants === undefined) return;
  await db.delete(subscriptionGrants).where(eq(subscriptionGrants.subscriptionId, subscriptionId));
  for (const g of grants) {
    if (g.amount > 0) await db.insert(subscriptionGrants).values({ subscriptionId, kind: g.kind, currencyId: g.kind === "currency" ? (g.currencyId ?? null) : null, amount: g.amount });
  }
}

/**
 * Flat CRUD for recurring real-money commitments, plus a link-income-source
 * action. A subscription's `grants` (see subscription_grants in schema.ts)
 * is a full-replace child array, same pattern as purchases.ts. A
 * subscription that grants in-game currency doubles as (links to) a real
 * `income_sources` row instead of reinventing claim tracking — see
 * schema.ts's comment and docs/progress.md's Stage 9 entry for why.
 */
export async function spendSubscriptionRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/spend-subscriptions", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const rows = await db.select().from(spendSubscriptions).where(eq(spendSubscriptions.gameId, req.params.game));
    const grantsById = await grantsBySubscriptionId(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, grants: grantsById.get(r.id) ?? [] }));
  });

  app.post(
    "/api/games/:game/spend-subscriptions",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> & { grants?: GrantInput[] } }>) => {
      const { grants, ...body } = req.body;
      const [row] = (await db
        .insert(spendSubscriptions)
        .values({ gameId: req.params.game, ...body } as any)
        .returning()) as any[];
      await replaceGrants(row.id, grants);
      return { ...row, grants: grants ?? [] };
    },
  );

  app.patch(
    "/api/games/:game/spend-subscriptions/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> & { grants?: GrantInput[] } }>, reply) => {
      const { grants, ...body } = req.body;
      const id = Number(req.params.id);
      const [row] = (await db
        .update(spendSubscriptions)
        .set(body)
        .where(and(eq(spendSubscriptions.gameId, req.params.game), eq(spendSubscriptions.id, id)))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      await replaceGrants(id, grants);
      const rowGrants = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.subscriptionId, id));
      return { ...row, grants: rowGrants };
    },
  );

  app.delete("/api/games/:game/spend-subscriptions/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    const id = Number(req.params.id);
    await db.delete(subscriptionGrants).where(eq(subscriptionGrants.subscriptionId, id));
    await db.delete(spendSubscriptions).where(and(eq(spendSubscriptions.gameId, req.params.game), eq(spendSubscriptions.id, id)));
    return { ok: true };
  });

  // Cancel is a status change, not a delete — the paid history stays real and visible.
  app.post("/api/games/:game/spend-subscriptions/:id/cancel", async (req: FastifyRequest<{ Params: GameIdParams }>, reply) => {
    const [row] = (await db
      .update(spendSubscriptions)
      .set({ status: "cancelled", cancelledAt: Math.floor(Date.now() / 1000) })
      .where(and(eq(spendSubscriptions.gameId, req.params.game), eq(spendSubscriptions.id, Number(req.params.id))))
      .returning()) as any[];
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });

  // Creates (or returns the already-linked) income_sources row for a
  // subscription's first currency grant, so its claim rate/unclaimed
  // detection reuses the exact Stage 3 claim engine instead of duplicating
  // it. Any additional grants (e.g. a direct pull count alongside the
  // currency) simply aren't claim-tracked — nothing to claim there.
  app.post(
    "/api/games/:game/spend-subscriptions/:id/link-income-source",
    async (req: FastifyRequest<{ Params: GameIdParams }>, reply) => {
      const { game } = req.params;
      const id = Number(req.params.id);
      const [sub] = await db
        .select()
        .from(spendSubscriptions)
        .where(and(eq(spendSubscriptions.gameId, game), eq(spendSubscriptions.id, id)));
      if (!sub) return reply.code(404).send({ error: "Not found" });
      if (sub.linkedIncomeSourceId) {
        const [existing] = await db.select().from(incomeSources).where(eq(incomeSources.id, sub.linkedIncomeSourceId));
        return existing;
      }
      const grants = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.subscriptionId, id));
      const currencyGrant = grants.find((g) => g.kind === "currency" && g.currencyId);
      if (!currencyGrant) {
        return reply.code(400).send({ error: "Subscription doesn't grant a currency amount to link" });
      }

      const [source] = (await db
        .insert(incomeSources)
        .values({
          gameId: game,
          name: sub.label,
          currencyId: currencyGrant.currencyId!,
          cadence: sub.cadence,
          customCadenceLabel: sub.customCadenceLabel,
          intervalDays: sub.intervalDays,
          amountPerEvent: currencyGrant.amount,
          category: "Guaranteed",
          enabled: true,
        })
        .returning()) as any[];

      const [updated] = (await db
        .update(spendSubscriptions)
        .set({ linkedIncomeSourceId: source.id })
        .where(eq(spendSubscriptions.id, id))
        .returning()) as any[];

      return { subscription: updated, incomeSource: source };
    },
  );
}
