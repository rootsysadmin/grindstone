import { and, eq } from "drizzle-orm";
import type { EntityKey } from "@grindstone/shared";
import { entityConfigs } from "@grindstone/shared";
import { db } from "../db/client.js";
import { characterLevelCosts, equipmentLevelCosts, skillLevelCosts } from "../db/schema.js";
import { apiPathToEntity } from "./masterDataTables.js";
import { slugify, withUniqueSlug } from "./slugify.js";

/**
 * The 3 entities whose per-band material cost schedule should ride along
 * when the parent is duplicated — copied by natural columns
 * (fromLevel/toLevel/materialId/quantity, plus kind/expAmount for
 * characters/equipment now that EXP-based leveling rows exist there — see
 * apps/api/src/db/schema.ts) onto the new parent id. Modules (Cartridges
 * included) have no such table — Cartridges/Modules don't level at all,
 * confirmed with the user — so duplicating one just clones its own fields
 * below, nothing more to do.
 */
const levelCostChildren: Partial<Record<EntityKey, { table: typeof characterLevelCosts | typeof equipmentLevelCosts | typeof skillLevelCosts; parentColumn: string }>> = {
  characters: { table: characterLevelCosts, parentColumn: "characterId" },
  equipmentItems: { table: equipmentLevelCosts, parentColumn: "equipmentItemId" },
  skills: { table: skillLevelCosts, parentColumn: "skillId" },
};

/**
 * Clones a master-data row — every column from the source except its
 * identity/audit fields, a caller-supplied name (defaulting to a
 * "(copy)"-suffixed name if none given), and a slug derived from that final
 * name — plus, for characters/equipment/skills, every level-cost child row
 * riding along onto the new id. Generic over every entity in
 * entityConfigs: a module's mainStat/setBonusText/pieceType or a
 * character's rank/elementId just come along as part of the same full-row
 * copy, no per-entity field list to maintain.
 *
 * The name is set at creation time (not "(copy)" then renamed after) so the
 * slug — which drives image-file lookup — is correct from the start. A
 * rename via the record editor's plain PATCH never recomputes slug, so a
 * post-hoc rename would otherwise leave the slug (and therefore the image
 * match) permanently stuck on the "(copy)" name.
 */
export async function duplicateMasterDataRow(gameId: string, key: EntityKey, id: number, name?: string): Promise<Record<string, unknown> | null> {
  const config = entityConfigs[key];
  const { table } = apiPathToEntity.get(config.apiPath)!;
  const t = table as any;

  const [source] = await db.select().from(t).where(and(eq(t.gameId, gameId), eq(t.id, id)));
  if (!source) return null;

  const { id: _id, gameId: _gameId, slug: _slug, name: sourceName, createdAt: _createdAt, updatedAt: _updatedAt, updatedBy: _updatedBy, ...rest } = source;
  const newName = name?.trim() || `${sourceName} (copy)`;
  const newSlug = await withUniqueSlug(t, gameId, slugify(newName));

  const [inserted] = (await db
    .insert(t)
    .values({ ...rest, gameId, slug: newSlug, name: newName, source: "manual" })
    .returning()) as any[];

  const child = levelCostChildren[key];
  if (child) {
    const ct = child.table as any;
    const rows = await db
      .select()
      .from(ct)
      .where(and(eq(ct.gameId, gameId), eq(ct[child.parentColumn], id)));
    for (const row of rows) {
      const values: Record<string, unknown> = {
        gameId,
        [child.parentColumn]: inserted.id,
        fromLevel: row.fromLevel,
        toLevel: row.toLevel,
        materialId: row.materialId,
        quantity: row.quantity,
        source: "manual",
      };
      // Only characterLevelCosts/equipmentLevelCosts rows carry kind/expAmount
      // (skillLevelCosts has no such columns) — copy them only when present.
      if ("kind" in row) values.kind = row.kind;
      if ("expAmount" in row) values.expAmount = row.expAmount;
      await db.insert(ct).values(values);
    }
  }

  return inserted;
}
