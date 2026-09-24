import { and, eq } from "drizzle-orm";
import type { EntityKey } from "@grindstone/shared";
import { entityConfigs, entityDependencyOrder } from "@grindstone/shared";
import { db } from "../db/client.js";
import { apiPathToEntity } from "./masterDataTables.js";
import { characterLevelCosts, equipmentLevelCosts, eventRewards, materialSources, moduleTargets, skillLevelCosts } from "../db/schema.js";

/** "elementId" -> "elementSlug", "featuredCharacterId" -> "featuredCharacterSlug". */
function slugFieldFor(idFieldKey: string): string {
  return idFieldKey.replace(/Id$/, "Slug");
}

// The top-level master-data entities, keyed by their own slug (see below
// for the 4 "child row" tables, which aren't independently browsable and
// so don't have a slug of their own).
export type GameBundle = Partial<Record<EntityKey, Record<string, unknown>[]>> & {
  materialSources?: { materialSlug: string; name: string; notes?: string | null }[];
  moduleTargets?: {
    moduleSlug: string;
    forCharacterSlug?: string | null;
    label: string;
    mainStatTarget?: string | null;
    substats?: string | null;
    notes?: string | null;
  }[];
  eventRewards?: {
    eventSlug: string;
    kind: "currency" | "material";
    currencySlug?: string | null;
    materialSlug?: string | null;
    quantity?: number | null;
  }[];
  characterLevelCosts?: LevelCostBundleRow<"characterSlug">[];
  equipmentLevelCosts?: LevelCostBundleRow<"equipmentSlug">[];
  skillLevelCosts?: MaterialLevelCostBundleRow<"skillSlug">[];
};

/** The original, material-only shape — skillLevelCosts has no kind/expAmount columns, so it never gets the "exp" variant below. */
type MaterialLevelCostBundleRow<ParentKey extends string> = { [K in ParentKey]: string } & {
  fromLevel: number;
  toLevel: number;
  kind?: "material";
  materialSlug: string;
  quantity: number;
  source: "auto" | "manual" | "override";
};

// Two row kinds share this shape (see apps/api/src/db/schema.ts's
// characterLevelCosts/equipmentLevelCosts comment): a "material" row (the
// original shape above) or an "exp" row (a flat EXP amount, character/
// equipment only).
type LevelCostBundleRow<ParentKey extends string> =
  | MaterialLevelCostBundleRow<ParentKey>
  | ({ [K in ParentKey]: string } & { fromLevel: number; toLevel: number; kind: "exp"; expAmount: number; source: "auto" | "manual" | "override" });

/**
 * Which GameBundle child-row arrays "belong" to a given top-level entity —
 * used to scope exportGameBundle/importGameBundle down to one entity plus
 * its sub-items, for the per-table JSON export/import in masterData.ts
 * (as opposed to a whole-game bundle, which wants every key).
 */
export const childBundleKeysForEntity: Partial<Record<EntityKey, (keyof GameBundle)[]>> = {
  characters: ["characterLevelCosts"],
  equipmentItems: ["equipmentLevelCosts"],
  skills: ["skillLevelCosts"],
  modules: ["moduleTargets"],
  events: ["eventRewards"],
  materials: ["materialSources"],
};

/**
 * Every row for a game, in dependency order, with relation columns
 * expressed as slug references (e.g. `elementSlug: "incantation"`) instead
 * of raw numeric ids — so the bundle is portable across databases and
 * directly re-importable (this is also exactly the shape of
 * games/<slug>/seed/*.json — see importGameBundle). Includes the 6 "child
 * row" tables (material sources, module targets, event rewards, and the 3
 * level-cost schedules) too, referencing their parent and any material by
 * slug rather than a raw id, for the same reason.
 *
 * Pass `only` to scope the result to a handful of entities plus their
 * child-row tables (via childBundleKeysForEntity) instead of the whole
 * game — used by masterData.ts's per-table export.json route. Rows for
 * every entity are still queried regardless of scope, since a scoped
 * entity's relation fields (e.g. a character's elementSlug) may point at
 * an entity outside the scope and still need to resolve to a real slug.
 */
export async function exportGameBundle(gameId: string, only?: EntityKey[]): Promise<GameBundle> {
  const rowsByEntity: Partial<Record<EntityKey, any[]>> = {};
  for (const key of entityDependencyOrder) {
    const { table } = apiPathToEntity.get(entityConfigs[key].apiPath)!;
    const t = table as any;
    rowsByEntity[key] = await db.select().from(t).where(eq(t.gameId, gameId));
  }

  const slugById = (key: EntityKey, id: unknown): string | null => {
    if (id === null || id === undefined) return null;
    return rowsByEntity[key]?.find((r) => r.id === id)?.slug ?? null;
  };

  const wantedChildKeys = only ? new Set(only.flatMap((k) => childBundleKeysForEntity[k] ?? [])) : null;

  const bundle: GameBundle = {};
  for (const key of entityDependencyOrder) {
    if (only && !only.includes(key)) continue;
    const config = entityConfigs[key];
    bundle[key] = rowsByEntity[key]!.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === "id" || k === "gameId") continue;
        const relField = config.fields.find((f) => f.key === k && f.type === "relation");
        if (relField) {
          out[slugFieldFor(k)] = slugById(relField.relationEntity as EntityKey, v);
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }

  if (!wantedChildKeys || wantedChildKeys.has("materialSources")) {
    const sourceRows = await db.select().from(materialSources).where(eq(materialSources.gameId, gameId));
    bundle.materialSources = sourceRows.map((r) => ({
      materialSlug: slugById("materials", r.materialId)!,
      name: r.name,
      notes: r.notes,
    }));
  }

  if (!wantedChildKeys || wantedChildKeys.has("moduleTargets")) {
    const targetRows = await db.select().from(moduleTargets).where(eq(moduleTargets.gameId, gameId));
    bundle.moduleTargets = targetRows.map((r) => ({
      moduleSlug: slugById("modules", r.moduleId)!,
      forCharacterSlug: slugById("characters", r.forCharacterId),
      label: r.label,
      mainStatTarget: r.mainStatTarget,
      substats: r.substats,
      notes: r.notes,
    }));
  }

  if (!wantedChildKeys || wantedChildKeys.has("eventRewards")) {
    const rewardRows = await db.select().from(eventRewards).where(eq(eventRewards.gameId, gameId));
    bundle.eventRewards = rewardRows.map((r) => ({
      eventSlug: slugById("events", r.eventId)!,
      kind: r.kind,
      currencySlug: slugById("currencies", r.currencyId),
      materialSlug: slugById("materials", r.materialId),
      quantity: r.quantity,
    }));
  }

  if (!wantedChildKeys || wantedChildKeys.has("characterLevelCosts")) {
    const charLevelCostRows = await db.select().from(characterLevelCosts).where(eq(characterLevelCosts.gameId, gameId));
    bundle.characterLevelCosts = charLevelCostRows.map((r): LevelCostBundleRow<"characterSlug"> =>
      r.kind === "exp"
        ? { characterSlug: slugById("characters", r.characterId)!, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "exp", expAmount: r.expAmount ?? 0, source: r.source }
        : { characterSlug: slugById("characters", r.characterId)!, fromLevel: r.fromLevel, toLevel: r.toLevel, materialSlug: slugById("materials", r.materialId)!, quantity: r.quantity ?? 0, source: r.source },
    );
  }

  if (!wantedChildKeys || wantedChildKeys.has("equipmentLevelCosts")) {
    const equipLevelCostRows = await db.select().from(equipmentLevelCosts).where(eq(equipmentLevelCosts.gameId, gameId));
    bundle.equipmentLevelCosts = equipLevelCostRows.map((r): LevelCostBundleRow<"equipmentSlug"> =>
      r.kind === "exp"
        ? { equipmentSlug: slugById("equipmentItems", r.equipmentItemId)!, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "exp", expAmount: r.expAmount ?? 0, source: r.source }
        : { equipmentSlug: slugById("equipmentItems", r.equipmentItemId)!, fromLevel: r.fromLevel, toLevel: r.toLevel, materialSlug: slugById("materials", r.materialId)!, quantity: r.quantity ?? 0, source: r.source },
    );
  }

  if (!wantedChildKeys || wantedChildKeys.has("skillLevelCosts")) {
    const skillLevelCostRows = await db.select().from(skillLevelCosts).where(eq(skillLevelCosts.gameId, gameId));
    bundle.skillLevelCosts = skillLevelCostRows.map((r) => ({
      skillSlug: slugById("skills", r.skillId)!,
      fromLevel: r.fromLevel,
      toLevel: r.toLevel,
      materialSlug: slugById("materials", r.materialId)!,
      quantity: r.quantity,
      source: r.source,
    }));
  }

  return bundle;
}

export interface ImportSummary {
  [entity: string]: { created: number; updated: number };
}

/**
 * Resolves a *Slug reference to a real row id: prefer the in-memory map
 * built from this same import pass (so a brand-new row just inserted a
 * moment ago resolves immediately), falling back to a DB lookup by
 * gameId+slug when the map has no entry. The DB fallback is what makes a
 * *scoped* import (e.g. masterData.ts's per-table import.json, which only
 * ever sends one or two entities' worth of rows) able to resolve a
 * relation that points at an entity outside that scope — e.g. importing
 * just characters.json still needs elementSlug/rankTierSlug to resolve
 * against elements/rankTiers that already exist in this game, not just
 * ones present in the same payload. For a full-bundle import this fallback
 * rarely triggers, since every entity's rows are already in the payload.
 */
async function resolveSlugId(
  gameId: string,
  entityKey: EntityKey,
  slug: string,
  idBySlug: Partial<Record<EntityKey, Map<string, number>>>,
): Promise<number | null> {
  const known = idBySlug[entityKey]?.get(slug);
  if (known !== undefined) return known;
  const { table } = apiPathToEntity.get(entityConfigs[entityKey].apiPath)!;
  const t = table as any;
  const rows = await db.select({ id: t.id }).from(t).where(and(eq(t.gameId, gameId), eq(t.slug, slug)));
  return rows[0]?.id ?? null;
}

/**
 * Upserts (by slug) every entity in the bundle, in dependency order, so a
 * row's relation fields (given as *Slug references, see exportGameBundle)
 * always resolve against already-imported rows. This is the single place
 * that logic lives — the seed loader (apps/api/src/db/seed.ts) and the
 * /api/games/:game/import route both call this rather than duplicating it.
 * Also imports the 6 "child row" tables (material sources, module targets,
 * event rewards, and the 3 level-cost schedules), after all the main
 * entities (so their slug references
 * resolve) — matched on a natural key (e.g. a material source's
 * materialSlug+name) so re-importing updates in place instead of
 * duplicating, same as the main entities.
 *
 * Note this whole function is a blind natural-key upsert with no
 * provenance check — including for the main entities above, which also
 * have a `source` column. That's intentional: a bundle export/import is a
 * full-fidelity backup/restore/move-between-installs tool, not a partial
 * external-data merge, so it isn't the same job as updateSync.ts's
 * provenance-safe sync (which deliberately never touches a manual/override
 * row) — don't copy this function's unconditional upsert into that one,
 * or vice versa.
 *
 * Known limitation: a self-referencing slug only resolves if the target
 * row appears earlier in the same entity's array — no current seed data
 * has a self-referencing relation, so a two-pass resolver hasn't been
 * built. If one's ever needed, that's the fix, not a workaround here.
 */
export async function importGameBundle(gameId: string, bundle: GameBundle): Promise<ImportSummary> {
  const summary: ImportSummary = {};
  const idBySlug: Partial<Record<EntityKey, Map<string, number>>> = {};

  for (const key of entityDependencyOrder) {
    const config = entityConfigs[key];
    const { table } = apiPathToEntity.get(config.apiPath)!;
    const t = table as any;
    const rows = bundle[key] ?? [];
    const map = new Map<string, number>();
    idBySlug[key] = map;
    let created = 0;
    let updated = 0;

    for (const raw of rows) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k.endsWith("Slug")) {
          const idKey = k.replace(/Slug$/, "Id");
          const relField = config.fields.find((f) => f.key === idKey && f.type === "relation");
          if (relField) {
            row[idKey] = v ? await resolveSlugId(gameId, relField.relationEntity as EntityKey, v as string, idBySlug) : null;
            continue;
          }
        }
        row[k] = v;
      }

      const slug = row.slug as string;
      const existing = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.gameId, gameId), eq(t.slug, slug)));

      let id: number;
      if (existing[0]) {
        await db
          .update(t)
          .set({ ...row, updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(t.id, existing[0].id));
        id = existing[0].id;
        updated++;
      } else {
        const [inserted] = (await db.insert(t).values({ ...row, gameId }).returning()) as any[];
        id = inserted.id;
        created++;
      }
      map.set(slug, id);
    }
    summary[key] = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const s of bundle.materialSources ?? []) {
      const materialId = await resolveSlugId(gameId, "materials", s.materialSlug, idBySlug);
      if (!materialId) continue;
      const existing = await db
        .select({ id: materialSources.id })
        .from(materialSources)
        .where(and(eq(materialSources.gameId, gameId), eq(materialSources.materialId, materialId), eq(materialSources.name, s.name)));
      if (existing[0]) {
        await db.update(materialSources).set({ notes: s.notes ?? null }).where(eq(materialSources.id, existing[0].id));
        updated++;
      } else {
        await db.insert(materialSources).values({ gameId, materialId, name: s.name, notes: s.notes ?? null });
        created++;
      }
    }
    summary.materialSources = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const t of bundle.moduleTargets ?? []) {
      const moduleId = await resolveSlugId(gameId, "modules", t.moduleSlug, idBySlug);
      if (!moduleId) continue;
      const forCharacterId = t.forCharacterSlug ? await resolveSlugId(gameId, "characters", t.forCharacterSlug, idBySlug) : null;
      const existing = await db
        .select({ id: moduleTargets.id })
        .from(moduleTargets)
        .where(and(eq(moduleTargets.gameId, gameId), eq(moduleTargets.moduleId, moduleId), eq(moduleTargets.label, t.label)));
      const values = {
        forCharacterId,
        mainStatTarget: t.mainStatTarget ?? null,
        substats: t.substats ?? null,
        notes: t.notes ?? null,
      };
      if (existing[0]) {
        await db.update(moduleTargets).set(values).where(eq(moduleTargets.id, existing[0].id));
        updated++;
      } else {
        await db.insert(moduleTargets).values({ gameId, moduleId, label: t.label, ...values });
        created++;
      }
    }
    summary.moduleTargets = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const r of bundle.eventRewards ?? []) {
      const eventId = await resolveSlugId(gameId, "events", r.eventSlug, idBySlug);
      if (!eventId) continue;
      const currencyId = r.currencySlug ? await resolveSlugId(gameId, "currencies", r.currencySlug, idBySlug) : undefined;
      const materialId = r.materialSlug ? await resolveSlugId(gameId, "materials", r.materialSlug, idBySlug) : undefined;
      const existing = await db
        .select({ id: eventRewards.id })
        .from(eventRewards)
        .where(
          and(
            eq(eventRewards.gameId, gameId),
            eq(eventRewards.eventId, eventId),
            eq(eventRewards.kind, r.kind),
            r.kind === "currency" ? eq(eventRewards.currencyId, currencyId ?? -1) : eq(eventRewards.materialId, materialId ?? -1),
          ),
        );
      const values = { quantity: r.quantity ?? null };
      if (existing[0]) {
        await db.update(eventRewards).set(values).where(eq(eventRewards.id, existing[0].id));
        updated++;
      } else {
        await db.insert(eventRewards).values({
          gameId,
          eventId,
          kind: r.kind,
          currencyId: currencyId ?? null,
          materialId: materialId ?? null,
          ...values,
        });
        created++;
      }
    }
    summary.eventRewards = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const r of bundle.characterLevelCosts ?? []) {
      const characterId = await resolveSlugId(gameId, "characters", r.characterSlug, idBySlug);
      if (!characterId) continue;
      if (r.kind === "exp") {
        const existing = await db
          .select({ id: characterLevelCosts.id })
          .from(characterLevelCosts)
          .where(
            and(
              eq(characterLevelCosts.gameId, gameId),
              eq(characterLevelCosts.characterId, characterId),
              eq(characterLevelCosts.fromLevel, r.fromLevel),
              eq(characterLevelCosts.toLevel, r.toLevel),
              eq(characterLevelCosts.kind, "exp"),
            ),
          );
        const values = { expAmount: r.expAmount, source: r.source };
        if (existing[0]) {
          await db.update(characterLevelCosts).set(values).where(eq(characterLevelCosts.id, existing[0].id));
          updated++;
        } else {
          await db.insert(characterLevelCosts).values({ gameId, characterId, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "exp", ...values });
          created++;
        }
        continue;
      }
      const materialId = await resolveSlugId(gameId, "materials", r.materialSlug, idBySlug);
      if (!materialId) continue;
      const existing = await db
        .select({ id: characterLevelCosts.id })
        .from(characterLevelCosts)
        .where(
          and(
            eq(characterLevelCosts.gameId, gameId),
            eq(characterLevelCosts.characterId, characterId),
            eq(characterLevelCosts.fromLevel, r.fromLevel),
            eq(characterLevelCosts.toLevel, r.toLevel),
            eq(characterLevelCosts.materialId, materialId),
          ),
        );
      const values = { quantity: r.quantity, source: r.source };
      if (existing[0]) {
        await db.update(characterLevelCosts).set(values).where(eq(characterLevelCosts.id, existing[0].id));
        updated++;
      } else {
        await db.insert(characterLevelCosts).values({ gameId, characterId, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "material", materialId, ...values });
        created++;
      }
    }
    summary.characterLevelCosts = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const r of bundle.equipmentLevelCosts ?? []) {
      const equipmentItemId = await resolveSlugId(gameId, "equipmentItems", r.equipmentSlug, idBySlug);
      if (!equipmentItemId) continue;
      if (r.kind === "exp") {
        const existing = await db
          .select({ id: equipmentLevelCosts.id })
          .from(equipmentLevelCosts)
          .where(
            and(
              eq(equipmentLevelCosts.gameId, gameId),
              eq(equipmentLevelCosts.equipmentItemId, equipmentItemId),
              eq(equipmentLevelCosts.fromLevel, r.fromLevel),
              eq(equipmentLevelCosts.toLevel, r.toLevel),
              eq(equipmentLevelCosts.kind, "exp"),
            ),
          );
        const values = { expAmount: r.expAmount, source: r.source };
        if (existing[0]) {
          await db.update(equipmentLevelCosts).set(values).where(eq(equipmentLevelCosts.id, existing[0].id));
          updated++;
        } else {
          await db.insert(equipmentLevelCosts).values({ gameId, equipmentItemId, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "exp", ...values });
          created++;
        }
        continue;
      }
      const materialId = await resolveSlugId(gameId, "materials", r.materialSlug, idBySlug);
      if (!materialId) continue;
      const existing = await db
        .select({ id: equipmentLevelCosts.id })
        .from(equipmentLevelCosts)
        .where(
          and(
            eq(equipmentLevelCosts.gameId, gameId),
            eq(equipmentLevelCosts.equipmentItemId, equipmentItemId),
            eq(equipmentLevelCosts.fromLevel, r.fromLevel),
            eq(equipmentLevelCosts.toLevel, r.toLevel),
            eq(equipmentLevelCosts.materialId, materialId),
          ),
        );
      const values = { quantity: r.quantity, source: r.source };
      if (existing[0]) {
        await db.update(equipmentLevelCosts).set(values).where(eq(equipmentLevelCosts.id, existing[0].id));
        updated++;
      } else {
        await db.insert(equipmentLevelCosts).values({ gameId, equipmentItemId, fromLevel: r.fromLevel, toLevel: r.toLevel, kind: "material", materialId, ...values });
        created++;
      }
    }
    summary.equipmentLevelCosts = { created, updated };
  }

  {
    let created = 0;
    let updated = 0;
    for (const r of bundle.skillLevelCosts ?? []) {
      const skillId = await resolveSlugId(gameId, "skills", r.skillSlug, idBySlug);
      const materialId = await resolveSlugId(gameId, "materials", r.materialSlug, idBySlug);
      if (!skillId || !materialId) continue;
      const existing = await db
        .select({ id: skillLevelCosts.id })
        .from(skillLevelCosts)
        .where(
          and(
            eq(skillLevelCosts.gameId, gameId),
            eq(skillLevelCosts.skillId, skillId),
            eq(skillLevelCosts.fromLevel, r.fromLevel),
            eq(skillLevelCosts.toLevel, r.toLevel),
            eq(skillLevelCosts.materialId, materialId),
          ),
        );
      const values = { quantity: r.quantity, source: r.source };
      if (existing[0]) {
        await db.update(skillLevelCosts).set(values).where(eq(skillLevelCosts.id, existing[0].id));
        updated++;
      } else {
        await db.insert(skillLevelCosts).values({ gameId, skillId, fromLevel: r.fromLevel, toLevel: r.toLevel, materialId, ...values });
        created++;
      }
    }
    summary.skillLevelCosts = { created, updated };
  }

  return summary;
}
