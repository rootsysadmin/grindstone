import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { purchaseGrants, purchases } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };
type GrantInput = { kind: "currency" | "pulls"; currencyId?: number | null; amount: number };

async function grantsByPurchaseId(purchaseIds: number[]): Promise<Map<number, { id: number; kind: string; currencyId: number | null; amount: number }[]>> {
  if (purchaseIds.length === 0) return new Map();
  const rows = await db.select().from(purchaseGrants).where(inArray(purchaseGrants.purchaseId, purchaseIds));
  const map = new Map<number, typeof rows>();
  for (const r of rows) map.set(r.purchaseId, [...(map.get(r.purchaseId) ?? []), r]);
  return map;
}

async function replaceGrants(purchaseId: number, grants: GrantInput[] | undefined) {
  if (grants === undefined) return;
  await db.delete(purchaseGrants).where(eq(purchaseGrants.purchaseId, purchaseId));
  for (const g of grants) {
    if (g.amount > 0) await db.insert(purchaseGrants).values({ purchaseId, kind: g.kind, currencyId: g.kind === "currency" ? (g.currencyId ?? null) : null, amount: g.amount });
  }
}

/** Flat CRUD, mirrors wishlist.ts. Real-money purchases only — each purchase's `grants` (see purchase_grants in schema.ts) is a full-replace child array on every write, same pattern as roster.ts's skillLevels. */
export async function purchaseRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/purchases", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const rows = await db.select().from(purchases).where(eq(purchases.gameId, req.params.game));
    const grantsById = await grantsByPurchaseId(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, grants: grantsById.get(r.id) ?? [] }));
  });

  app.post(
    "/api/games/:game/purchases",
    async (req: FastifyRequest<{ Params: GameParams; Body: Record<string, unknown> & { grants?: GrantInput[] } }>) => {
      const { grants, ...body } = req.body;
      const [row] = (await db
        .insert(purchases)
        .values({ gameId: req.params.game, ...body } as any)
        .returning()) as any[];
      await replaceGrants(row.id, grants);
      return { ...row, grants: grants ?? [] };
    },
  );

  app.patch(
    "/api/games/:game/purchases/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: Record<string, unknown> & { grants?: GrantInput[] } }>, reply) => {
      const { grants, ...body } = req.body;
      const id = Number(req.params.id);
      const [row] = (await db
        .update(purchases)
        .set(body)
        .where(and(eq(purchases.gameId, req.params.game), eq(purchases.id, id)))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      await replaceGrants(id, grants);
      const rowGrants = await db.select().from(purchaseGrants).where(eq(purchaseGrants.purchaseId, id));
      return { ...row, grants: rowGrants };
    },
  );

  app.delete("/api/games/:game/purchases/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    const id = Number(req.params.id);
    await db.delete(purchaseGrants).where(eq(purchaseGrants.purchaseId, id));
    await db.delete(purchases).where(and(eq(purchases.gameId, req.params.game), eq(purchases.id, id)));
    return { ok: true };
  });
}
