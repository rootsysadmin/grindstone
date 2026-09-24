import { and, eq } from "drizzle-orm";
import type { LevelCostBandDraft, NewCharacterDraft, NewEquipmentDraft, NewMaterialDraft, RewardDraft, SyncSummary, UpdatePayload } from "@grindstone/shared";
import { db } from "../db/client.js";
import {
  banners,
  characterLevelCosts,
  characters,
  codeRewards,
  currencies,
  elements,
  equipmentItems,
  equipmentLevelCosts,
  eventRewards,
  events,
  ingestedUpdateFiles,
  materials,
  redeemCodes,
  skillLevelCosts,
  skills,
  syncRuns,
  syncSettings,
} from "../db/schema.js";
import { slugify } from "./slugify.js";

/**
 * A slug that doesn't resolve to a real row in this install's master data
 * (a reward referencing a currency this install hasn't seeded, a banner
 * naming a character that doesn't exist here) is dropped silently rather
 * than failing the whole update — see docs/progress.md's Stage 10
 * follow-up entry.
 */
async function resolveIdBySlug(table: typeof characters | typeof equipmentItems | typeof currencies | typeof materials | typeof elements | typeof skills, gameId: string, slug: string | null | undefined): Promise<number | null> {
  if (!slug) return null;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.gameId, gameId), eq(table.slug, slug)));
  return row?.id ?? null;
}

/** Resolves every RewardDraft's slug reference to a real id, dropping any that don't resolve in this install. */
async function resolveRewards(gameId: string, rewards: RewardDraft[] | undefined): Promise<{ kind: "currency" | "material"; currencyId: number | null; materialId: number | null; quantity: number }[]> {
  if (!rewards) return [];
  const resolved = await Promise.all(
    rewards.map(async (r) => ({
      kind: r.kind,
      currencyId: r.kind === "currency" ? await resolveIdBySlug(currencies, gameId, r.currencySlug) : null,
      materialId: r.kind === "material" ? await resolveIdBySlug(materials, gameId, r.materialSlug) : null,
      quantity: r.quantity,
    })),
  );
  return resolved.filter((r) => (r.kind === "currency" ? r.currencyId != null : r.materialId != null) && r.quantity > 0);
}

/**
 * A banner introducing a new character creates it rather than leaving
 * featuredCharacterId null — see the NewCharacterDraft comment in
 * packages/shared/src/sync.ts. Same create/update/skip-by-provenance rule
 * as everything else: no existing row -> create as auto; existing auto row
 * -> update (a later, more accurate sync corrects an earlier stub);
 * existing manual/override row -> left untouched, still linked (you've
 * already perfected it, a sync shouldn't relink the banner to nothing).
 */
async function upsertCharacterDraft(gameId: string, draft: NewCharacterDraft): Promise<number> {
  const slug = slugify(draft.name);
  const [existing] = await db.select().from(characters).where(and(eq(characters.gameId, gameId), eq(characters.slug, slug)));
  const values = {
    rank: draft.rank ?? null,
    elementId: await resolveIdBySlug(elements, gameId, draft.elementSlug),
    role: draft.role ?? null,
    releaseDate: draft.releaseDate ?? null,
  };
  if (!existing) {
    const [row] = (await db.insert(characters).values({ gameId, slug, name: draft.name, source: "auto", ...values }).returning()) as any[];
    return row.id;
  }
  if (existing.source !== "auto") return existing.id;
  await db.update(characters).set({ name: draft.name, updatedAt: Math.floor(Date.now() / 1000), ...values }).where(eq(characters.id, existing.id));
  return existing.id;
}

/** Equivalent of upsertCharacterDraft for a banner introducing a new weapon/Arc. */
async function upsertEquipmentDraft(gameId: string, draft: NewEquipmentDraft): Promise<number> {
  const slug = slugify(draft.name);
  const [existing] = await db.select().from(equipmentItems).where(and(eq(equipmentItems.gameId, gameId), eq(equipmentItems.slug, slug)));
  const values = { rank: draft.rank ?? null, type: draft.type ?? null, mainStat: draft.mainStat ?? null };
  if (!existing) {
    const [row] = (await db.insert(equipmentItems).values({ gameId, slug, name: draft.name, source: "auto", ...values }).returning()) as any[];
    return row.id;
  }
  if (existing.source !== "auto") return existing.id;
  await db.update(equipmentItems).set({ name: draft.name, updatedAt: Math.floor(Date.now() / 1000), ...values }).where(eq(equipmentItems.id, existing.id));
  return existing.id;
}

/** Equivalent of upsertCharacterDraft/upsertEquipmentDraft for a material a level-costs update introduces that doesn't exist locally yet. */
async function upsertMaterialDraft(gameId: string, draft: NewMaterialDraft): Promise<number> {
  const slug = slugify(draft.name);
  const [existing] = await db.select().from(materials).where(and(eq(materials.gameId, gameId), eq(materials.slug, slug)));
  const values = { category: draft.category ?? null };
  if (!existing) {
    const [row] = (await db.insert(materials).values({ gameId, slug, name: draft.name, source: "auto", ...values }).returning()) as any[];
    return row.id;
  }
  if (existing.source !== "auto") return existing.id;
  await db.update(materials).set({ name: draft.name, updatedAt: Math.floor(Date.now() / 1000), ...values }).where(eq(materials.id, existing.id));
  return existing.id;
}

/**
 * Applies a level-costs update's bands against one of the three level-cost
 * tables. Deliberately three explicit blocks rather than one dynamic-column
 * generic — same reasoning as keeping upsertCharacterDraft/
 * upsertEquipmentDraft separate: Drizzle's typed columns differ enough
 * across the three tables (different parent-id column name) that a shared
 * generic would need casting throughout. Unlike codeRewards/eventRewards
 * (full-replaced whenever their parent applies), each band is matched and
 * upserted individually — bands stay independently hand-correctable via the
 * existing level-costs child-row editor, so a sync must never blow away a
 * hand-fixed one alongside its still-auto siblings.
 *
 * Two row kinds share this loop (see LevelCostBandDraft's doc comment):
 * "material" bands match by (target id, fromLevel, toLevel, materialId), as
 * before; "exp" bands (characters/equipment only — skillLevelCosts has no
 * kind/expAmount columns, so an exp-kind band targeting a skill is dropped)
 * match by (target id, fromLevel, toLevel, kind) instead, since there's no
 * per-material identity to key on.
 */
async function applyLevelCostBands(gameId: string, targetId: number, table: typeof characterLevelCosts | typeof equipmentLevelCosts | typeof skillLevelCosts, parentColumn: "characterId" | "equipmentItemId" | "skillId", bands: LevelCostBandDraft[]): Promise<"created" | "updated" | "skipped"> {
  let anyCreated = false;
  let anyUpdated = false;
  for (const band of bands) {
    const kind = band.kind ?? "material";

    if (kind === "exp") {
      if (parentColumn === "skillId") continue; // skills stay material-only
      const expAmount = band.expAmount ?? 0;
      if (expAmount <= 0) continue;
      const [existing] = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.gameId, gameId),
            eq((table as any)[parentColumn], targetId),
            eq(table.fromLevel, band.fromLevel),
            eq(table.toLevel, band.toLevel),
            eq((table as any).kind, "exp"),
          ),
        );
      if (!existing) {
        await db.insert(table).values({ gameId, [parentColumn]: targetId, fromLevel: band.fromLevel, toLevel: band.toLevel, kind: "exp", expAmount, source: "auto" } as any);
        anyCreated = true;
      } else if (existing.source === "auto") {
        await db.update(table).set({ expAmount } as any).where(eq(table.id, existing.id));
        anyUpdated = true;
      }
      continue;
    }

    const materialId = await resolveIdBySlug(materials, gameId, band.materialSlug);
    if (!materialId || !band.quantity || band.quantity <= 0) continue;
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.gameId, gameId), eq((table as any)[parentColumn], targetId), eq(table.fromLevel, band.fromLevel), eq(table.toLevel, band.toLevel), eq(table.materialId, materialId)));
    if (!existing) {
      const values: Record<string, unknown> = { gameId, [parentColumn]: targetId, fromLevel: band.fromLevel, toLevel: band.toLevel, materialId, quantity: band.quantity, source: "auto" };
      // skillLevelCosts has no `kind` column — only set it for the two tables that do.
      if (parentColumn !== "skillId") values.kind = "material";
      await db.insert(table).values(values as any);
      anyCreated = true;
    } else if (existing.source === "auto") {
      await db.update(table).set({ quantity: band.quantity }).where(eq(table.id, existing.id));
      anyUpdated = true;
    }
  }
  return anyCreated ? "created" : anyUpdated ? "updated" : "skipped";
}

/**
 * The provenance-safe upsert every sync (community-repo or a manually
 * logged update) goes through — genuinely new logic, not a reuse of
 * gameBundle.ts's importGameBundle, which blind-overwrites regardless of
 * the existing row's source. Here: no existing row -> insert as "auto";
 * existing row is already "auto" -> update in place; existing row is
 * "manual"/"override" -> skip, untouched. See docs/progress.md's Stage 10
 * entry for why this couldn't just extend the bundle-import path. Reward
 * child rows (code_rewards/event_rewards) ride along with the same
 * create/update/skip decision as their parent row.
 */
export async function applyUpdatePayload(gameId: string, payload: UpdatePayload): Promise<"created" | "updated" | "skipped"> {
  if (payload.kind === "code") {
    const [existing] = await db.select().from(redeemCodes).where(and(eq(redeemCodes.gameId, gameId), eq(redeemCodes.code, payload.code)));
    const status = existing ? (existing.source !== "auto" ? "skipped" : "updated") : "created";
    let codeId = existing?.id;
    if (status === "created") {
      const [row] = (await db.insert(redeemCodes).values({ gameId, code: payload.code, rewardLabel: payload.rewardLabel ?? null, source: "auto" }).returning()) as any[];
      codeId = row.id;
    } else if (status === "updated") {
      await db.update(redeemCodes).set({ rewardLabel: payload.rewardLabel ?? existing!.rewardLabel }).where(eq(redeemCodes.id, existing!.id));
    }
    if (status !== "skipped" && codeId != null) {
      const rewards = await resolveRewards(gameId, payload.rewards);
      await db.delete(codeRewards).where(eq(codeRewards.codeId, codeId));
      for (const r of rewards) await db.insert(codeRewards).values({ gameId, codeId, ...r });
    }
    return status;
  }

  if (payload.kind === "banner") {
    const slug = slugify(payload.name);
    const [existing] = await db.select().from(banners).where(and(eq(banners.gameId, gameId), eq(banners.slug, slug)));
    const values = {
      type: payload.type ?? null,
      featuredCharacterId: payload.newCharacter ? await upsertCharacterDraft(gameId, payload.newCharacter) : await resolveIdBySlug(characters, gameId, payload.featuredCharacterSlug),
      featuredEquipmentId: payload.newEquipment ? await upsertEquipmentDraft(gameId, payload.newEquipment) : await resolveIdBySlug(equipmentItems, gameId, payload.featuredEquipmentSlug),
      startDate: payload.startDate ?? null,
      endDate: payload.endDate ?? null,
    };
    if (!existing) {
      await db.insert(banners).values({ gameId, slug, name: payload.name, source: "auto", ...values });
      return "created";
    }
    if (existing.source !== "auto") return "skipped";
    await db.update(banners).set({ name: payload.name, updatedAt: Math.floor(Date.now() / 1000), ...values }).where(eq(banners.id, existing.id));
    return "updated";
  }

  if (payload.kind === "level-costs") {
    const targetTable = payload.targetKind === "character" ? characters : payload.targetKind === "equipment" ? equipmentItems : skills;
    const targetId = await resolveIdBySlug(targetTable, gameId, payload.targetSlug);
    if (!targetId) return "skipped"; // attaches to an existing parent only — never creates one, see LevelCostUpdatePayload's doc comment

    for (const draft of payload.newMaterials ?? []) await upsertMaterialDraft(gameId, draft);

    if (payload.targetKind === "character") return applyLevelCostBands(gameId, targetId, characterLevelCosts, "characterId", payload.bands);
    if (payload.targetKind === "equipment") return applyLevelCostBands(gameId, targetId, equipmentLevelCosts, "equipmentItemId", payload.bands);
    return applyLevelCostBands(gameId, targetId, skillLevelCosts, "skillId", payload.bands);
  }

  // events
  const slug = slugify(payload.name);
  const [existing] = await db.select().from(events).where(and(eq(events.gameId, gameId), eq(events.slug, slug)));
  const values = { startDate: payload.startDate ?? null, endDate: payload.endDate ?? null, notes: payload.notes ?? null };
  const status = existing ? (existing.source !== "auto" ? "skipped" : "updated") : "created";
  let eventId = existing?.id;
  if (status === "created") {
    const [row] = (await db.insert(events).values({ gameId, slug, name: payload.name, source: "auto", ...values }).returning()) as any[];
    eventId = row.id;
  } else if (status === "updated") {
    await db.update(events).set({ name: payload.name, updatedAt: Math.floor(Date.now() / 1000), ...values }).where(eq(events.id, existing!.id));
  }
  if (status !== "skipped" && eventId != null) {
    const rewards = await resolveRewards(gameId, payload.rewards);
    await db.delete(eventRewards).where(eq(eventRewards.eventId, eventId));
    for (const r of rewards) await db.insert(eventRewards).values({ gameId, eventId, ...r });
  }
  return status;
}

async function logRun(gameId: string, source: "community" | "manual", summary: SyncSummary) {
  await db.insert(syncRuns).values({
    gameId,
    source,
    createdCount: summary.created,
    updatedCount: summary.updated,
    skippedCount: summary.skipped,
  });
}

/** Records applying one payload as a "manual" sync run (a single Log Update dialog submission), for the same audit trail a community sync gets. */
export async function applyManualUpdate(gameId: string, payload: UpdatePayload): Promise<SyncSummary> {
  const status = await applyUpdatePayload(gameId, payload);
  const summary: SyncSummary = { created: status === "created" ? 1 : 0, updated: status === "updated" ? 1 : 0, skipped: status === "skipped" ? 1 : 0 };
  await logRun(gameId, "manual", summary);
  return summary;
}

export async function getSyncSettings() {
  const [row] = await db.select().from(syncSettings);
  return row ?? null;
}

/**
 * One Git Trees API call lists every path in the repo regardless of folder
 * depth — deliberately not the per-directory Contents API, which would
 * need one call per subfolder (codes/banners/events) for no real benefit.
 */
async function listRemoteUpdateFiles(owner: string, repo: string, gameSlug: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = (await res.json()) as { tree: { path: string; type: string }[] };
  const prefix = `games/${gameSlug}/`;
  return data.tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && t.path.endsWith(".json")).map((t) => t.path);
}

async function fetchRemoteFile(owner: string, repo: string, path: string): Promise<UpdatePayload[]> {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`);
  if (!res.ok) throw new Error(`GitHub raw fetch failed for ${path}: ${res.status}`);
  const data = (await res.json()) as UpdatePayload | UpdatePayload[];
  return Array.isArray(data) ? data : [data];
}

/**
 * Pulls whatever's new from the community data repo: lists every update
 * file for this game, skips any path already in ingested_update_files
 * (never re-fetches or re-applies the same file twice), applies each new
 * one through the same provenance-safe upsert, records what it ingested,
 * and logs one sync_runs row. Called by both the manual SYNC NOW button and
 * the opportunistic check-on-load in Shell.tsx — same function either way.
 */
export async function runCommunitySync(gameId: string): Promise<SyncSummary> {
  const settings = await getSyncSettings();
  if (!settings?.dataRepoOwner || !settings.dataRepoName) {
    return { created: 0, updated: 0, skipped: 0 };
  }

  // The repo not existing yet, a network hiccup, or GitHub being unreachable
  // are all expected, recoverable conditions here — not something that
  // should surface as a 500. A sync that finds nothing to do is silent
  // (matches "nightly-ish" being best-effort, not something you're meant to
  // babysit); the manual SYNC NOW button's caller can still tell it did
  // nothing from the zeroed summary.
  let remotePaths: string[];
  try {
    remotePaths = await listRemoteUpdateFiles(settings.dataRepoOwner, settings.dataRepoName, gameId);
  } catch {
    return { created: 0, updated: 0, skipped: 0 };
  }

  const ingested = await db.select({ path: ingestedUpdateFiles.path }).from(ingestedUpdateFiles).where(eq(ingestedUpdateFiles.gameId, gameId));
  const ingestedSet = new Set(ingested.map((r) => r.path));
  const newPaths = remotePaths.filter((p) => !ingestedSet.has(p));

  const summary: SyncSummary = { created: 0, updated: 0, skipped: 0 };
  for (const path of newPaths) {
    let payloads: UpdatePayload[];
    try {
      payloads = await fetchRemoteFile(settings.dataRepoOwner, settings.dataRepoName, path);
    } catch {
      continue; // one bad/unreachable file shouldn't abort the rest of the batch
    }
    for (const payload of payloads) {
      const status = await applyUpdatePayload(gameId, payload);
      summary[status === "created" ? "created" : status === "updated" ? "updated" : "skipped"]++;
    }
    await db.insert(ingestedUpdateFiles).values({ gameId, path });
  }

  if (newPaths.length > 0) await logRun(gameId, "community", summary);
  return summary;
}
