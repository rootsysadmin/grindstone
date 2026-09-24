import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { currencyInventory, materialInventory } from "../db/schema.js";

/** Credits (positive delta) or debits (negative delta) a currency/material balance for a game. Shared by anything that grants a real reward on a real event — task progress, event-reward claims. */
export async function adjustInventory(game: string, kind: "currency" | "material", id: number, delta: number) {
  if (delta === 0) return;
  const updatedAt = Math.floor(Date.now() / 1000);
  if (kind === "currency") {
    const [existing] = await db
      .select({ id: currencyInventory.id, balance: currencyInventory.balance })
      .from(currencyInventory)
      .where(and(eq(currencyInventory.gameId, game), eq(currencyInventory.currencyId, id)));
    const next = Math.max(0, (existing?.balance ?? 0) + delta);
    if (existing) {
      await db.update(currencyInventory).set({ balance: next, updatedAt }).where(eq(currencyInventory.id, existing.id));
    } else {
      await db.insert(currencyInventory).values({ gameId: game, currencyId: id, balance: next, updatedAt });
    }
  } else {
    const [existing] = await db
      .select({ id: materialInventory.id, quantity: materialInventory.quantity })
      .from(materialInventory)
      .where(and(eq(materialInventory.gameId, game), eq(materialInventory.materialId, id)));
    const next = Math.max(0, (existing?.quantity ?? 0) + delta);
    if (existing) {
      await db.update(materialInventory).set({ quantity: next, updatedAt }).where(eq(materialInventory.id, existing.id));
    } else {
      await db.insert(materialInventory).values({ gameId: game, materialId: id, quantity: next, updatedAt });
    }
  }
}
