import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { currencyInventory, materialInventory } from "../db/schema.js";

type GameParams = { game: string };

/**
 * What the player actually has on hand — always manual, there's no way
 * around that (see docs/progress.md's Stage 3 entry). One row per
 * material/currency; upserted on write rather than requiring a row to
 * already exist, since most materials/currencies start with no stock row
 * at all.
 */
export async function inventoryRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/inventory", async (req: FastifyRequest<{ Params: GameParams }>) => {
    const { game } = req.params;
    const materials = await db.select().from(materialInventory).where(eq(materialInventory.gameId, game));
    const currencies = await db.select().from(currencyInventory).where(eq(currencyInventory.gameId, game));
    return { materials, currencies };
  });

  app.put(
    "/api/games/:game/inventory/materials/:materialId",
    async (req: FastifyRequest<{ Params: GameParams & { materialId: string }; Body: { quantity: number } }>) => {
      const { game } = req.params;
      const materialId = Number(req.params.materialId);
      const quantity = Math.max(0, Number(req.body.quantity) || 0);
      const existing = await db
        .select({ id: materialInventory.id })
        .from(materialInventory)
        .where(and(eq(materialInventory.gameId, game), eq(materialInventory.materialId, materialId)));
      const updatedAt = Math.floor(Date.now() / 1000);
      if (existing[0]) {
        await db.update(materialInventory).set({ quantity, updatedAt }).where(eq(materialInventory.id, existing[0].id));
      } else {
        await db.insert(materialInventory).values({ gameId: game, materialId, quantity, updatedAt });
      }
      const [row] = await db
        .select()
        .from(materialInventory)
        .where(and(eq(materialInventory.gameId, game), eq(materialInventory.materialId, materialId)));
      return row;
    },
  );

  app.put(
    "/api/games/:game/inventory/currencies/:currencyId",
    async (req: FastifyRequest<{ Params: GameParams & { currencyId: string }; Body: { balance: number } }>) => {
      const { game } = req.params;
      const currencyId = Number(req.params.currencyId);
      const balance = Math.max(0, Number(req.body.balance) || 0);
      const existing = await db
        .select({ id: currencyInventory.id })
        .from(currencyInventory)
        .where(and(eq(currencyInventory.gameId, game), eq(currencyInventory.currencyId, currencyId)));
      const updatedAt = Math.floor(Date.now() / 1000);
      if (existing[0]) {
        await db.update(currencyInventory).set({ balance, updatedAt }).where(eq(currencyInventory.id, existing[0].id));
      } else {
        await db.insert(currencyInventory).values({ gameId: game, currencyId, balance, updatedAt });
      }
      const [row] = await db
        .select()
        .from(currencyInventory)
        .where(and(eq(currencyInventory.gameId, game), eq(currencyInventory.currencyId, currencyId)));
      return row;
    },
  );
}
