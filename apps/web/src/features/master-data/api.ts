import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityConfig, EntityKey, MasterDataRow } from "@grindstone/shared";
import { entityConfigs } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

function basePath(game: string, config: EntityConfig) {
  return `/api/games/${game}/${config.apiPath}`;
}

export function useEntityList(config: EntityConfig, params: Record<string, string> = {}) {
  const { slug: game } = useActiveGame();
  const qs = new URLSearchParams(params).toString();
  return useQuery<MasterDataRow[]>({
    queryKey: ["master-data", game, config.key, params],
    queryFn: () => fetch(`${basePath(game, config)}${qs ? `?${qs}` : ""}`).then(jsonOrThrow),
  });
}

export function useEntityRow(config: EntityConfig, id: number | null) {
  const { slug: game } = useActiveGame();
  return useQuery<MasterDataRow>({
    queryKey: ["master-data", game, config.key, "row", id],
    queryFn: () => fetch(`${basePath(game, config)}/${id}`).then(jsonOrThrow),
    enabled: id !== null,
  });
}

export function useCreateRow(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(basePath(game, config), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game, config.key] }),
  });
}

export function useUpdateRow(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`${basePath(game, config)}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game, config.key] }),
  });
}

export function useDeleteRow(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`${basePath(game, config)}/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game, config.key] }),
  });
}

/** Clones a row (every field, the caller-supplied name, slug derived from that final name) — and, for characters/equipment/skills, its level-cost schedule rides along server-side. Generic over every entity, same as the rest of this file's hooks. */
export function useDuplicateRow(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      fetch(`${basePath(game, config)}/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game, config.key] }),
  });
}

export function useUploadImage(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${basePath(game, config)}/${id}/image`, { method: "POST", body: form });
      return jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game, config.key] }),
  });
}

/** For every "relation" field on this entity, fetches the target entity's rows and returns id -> row maps, keyed by field key. */
export function useRelationOptions(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const relationFields = config.fields.filter((f) => f.type === "relation" && f.relationEntity);
  const results = useQueries({
    queries: relationFields.map((f) => {
      const target = entityConfigs[f.relationEntity as EntityKey];
      return {
        queryKey: ["master-data", game, target.key],
        queryFn: (): Promise<MasterDataRow[]> => fetch(basePath(game, target)).then(jsonOrThrow),
      };
    }),
  });
  const byField: Record<string, MasterDataRow[]> = {};
  relationFields.forEach((f, i) => {
    byField[f.key] = results[i]?.data ?? [];
  });
  return byField;
}

/** This game's rank tiers, ascending by level (index 0 = weakest, last = strongest). */
export function useRankTiers(): MasterDataRow[] {
  const { data: rows = [] } = useEntityList(entityConfigs.rankTiers);
  return [...rows].sort((a, b) => (a.level as number) - (b.level as number));
}

/** id -> {name, color, level} for this game's rank tiers — the one place every rank/rarity display (badges, roster cards, swatches, sorting) resolves a rankTierId, instead of each screen re-fetching entityConfigs.rankTiers itself. */
export function useRankTierMap(): Map<number, { name: string; color: string; level: number }> {
  const rows = useRankTiers();
  const map = new Map<number, { name: string; color: string; level: number }>();
  for (const r of rows) map.set(r.id as number, { name: r.name, color: String(r.color), level: r.level as number });
  return map;
}

export function csvExportUrl(game: string, config: EntityConfig) {
  return `${basePath(game, config)}/export.csv`;
}

/** Unlike export.csv (this table's own columns only), this includes the entity's sub-item child rows (level-cost bands, module targets, event rewards, material sources) with every relation expressed as a *Slug reference — the same shape as a full-game bundle export/games/<slug>/seed/*.json, just scoped to one entity, so it's directly usable as a starting point for hand-authoring seed data. */
export function jsonExportUrl(game: string, config: EntityConfig) {
  return `${basePath(game, config)}/export.json`;
}

export function gameExportUrl(game: string) {
  return `/api/games/${game}/export`;
}

/**
 * One hook set (list/create/update/delete) for a "child rows of one
 * parent" resource — material sources, module targets, event rewards.
 * These mirror apps/api/src/routes/childRows.ts's generic
 * shape, so this is written once and instantiated per resource below
 * rather than copy-pasted four times.
 */
function makeChildRowHooks<Row extends { id: number }>(path: string) {
  const base = (game: string, parentId: number) => `/api/games/${game}/${path.replace(":parentId", String(parentId))}`;

  function useList(parentId: number | null) {
    const { slug: game } = useActiveGame();
    return useQuery<Row[]>({
      queryKey: ["child-rows", game, path, parentId],
      queryFn: () => fetch(base(game, parentId!)).then(jsonOrThrow),
      enabled: parentId !== null,
    });
  }

  function useCreate(parentId: number) {
    const { slug: game } = useActiveGame();
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        fetch(base(game, parentId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(jsonOrThrow),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["child-rows", game, path, parentId] }),
    });
  }

  function useUpdate(parentId: number) {
    const { slug: game } = useActiveGame();
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        fetch(`${base(game, parentId)}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(jsonOrThrow),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["child-rows", game, path, parentId] }),
    });
  }

  function useDelete(parentId: number) {
    const { slug: game } = useActiveGame();
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: number) => fetch(`${base(game, parentId)}/${id}`, { method: "DELETE" }).then(jsonOrThrow),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["child-rows", game, path, parentId] }),
    });
  }

  return { useList, useCreate, useUpdate, useDelete };
}

export interface MaterialSourceRow {
  id: number;
  materialId: number;
  name: string;
  notes: string | null;
}
export const materialSourcesApi = makeChildRowHooks<MaterialSourceRow>("materials/:parentId/sources");

export interface ModuleTargetRow {
  id: number;
  moduleId: number;
  forCharacterId: number | null;
  label: string;
  mainStatTarget: string | null;
  substats: string | null; // JSON: { stat: string, value: string }[]
  notes: string | null;
  achievedAt: number | null; // unix seconds; null = not yet achieved
}
export const moduleTargetsApi = makeChildRowHooks<ModuleTargetRow>("modules/:parentId/targets");

/**
 * Every module target for the game, any parent module — needed to
 * aggregate a character's whole Set (Cartridge + Modules), or the whole
 * roster's outstanding gear, across the catalog at once. Same "flat
 * listing over a child-row table" idiom as planner/api.ts's level-cost
 * hooks (character-level-costs etc.).
 */
export function useAllModuleTargets() {
  const { slug: game } = useActiveGame();
  return useQuery<ModuleTargetRow[]>({
    queryKey: ["module-targets", game],
    queryFn: () => fetch(`/api/games/${game}/module-targets`).then(jsonOrThrow),
  });
}

/**
 * Create/update/delete a moduleTargets row for a dynamically-chosen parent
 * module — unlike moduleTargetsApi above (which binds one fixed moduleId
 * per hook call, fine for a single module's own record editor), callers
 * like ModuleSetSection/GearTab list rows spanning many different modules
 * at once, so moduleId has to be a per-call mutate() argument instead of a
 * hook-instantiation-time one.
 */
export function useCreateModuleTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, body }: { moduleId: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/modules/${moduleId}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then<ModuleTargetRow>(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["module-targets", game] });
      qc.invalidateQueries({ queryKey: ["child-rows", game, "modules/:parentId/targets"] });
    },
  });
}

export function useUpdateModuleTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, id, body }: { moduleId: number; id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/modules/${moduleId}/targets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["module-targets", game] });
      qc.invalidateQueries({ queryKey: ["child-rows", game, "modules/:parentId/targets"] });
    },
  });
}

export function useDeleteModuleTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, id }: { moduleId: number; id: number }) =>
      fetch(`/api/games/${game}/modules/${moduleId}/targets/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["module-targets", game] });
      qc.invalidateQueries({ queryKey: ["child-rows", game, "modules/:parentId/targets"] });
    },
  });
}

export interface EventRewardRow {
  id: number;
  eventId: number;
  kind: "currency" | "material";
  currencyId: number | null;
  materialId: number | null;
  quantity: number | null;
}
export const eventRewardsApi = makeChildRowHooks<EventRewardRow>("events/:parentId/rewards");

// Stage 3 — level-band cost schedules. Reaching toLevel from fromLevel
// costs either `quantity` of `materialId` (kind "material") or a flat
// `expAmount` (kind "exp", fillable by any combination of that entity's
// EXP-pool materials — see materials.expValue/expUsage). skillLevelCosts
// stays material-only (no kind/expAmount columns), so it keeps the
// original shape below.
export interface CharacterLevelCostRow {
  id: number;
  characterId: number;
  fromLevel: number;
  toLevel: number;
  kind: "material" | "exp";
  materialId: number | null;
  quantity: number | null;
  expAmount: number | null;
}
export const characterLevelCostsApi = makeChildRowHooks<CharacterLevelCostRow>("characters/:parentId/level-costs");

export interface EquipmentLevelCostRow {
  id: number;
  equipmentItemId: number;
  fromLevel: number;
  toLevel: number;
  kind: "material" | "exp";
  materialId: number | null;
  quantity: number | null;
  expAmount: number | null;
}
export const equipmentLevelCostsApi = makeChildRowHooks<EquipmentLevelCostRow>("equipment-items/:parentId/level-costs");

export interface SkillLevelCostRow {
  id: number;
  skillId: number;
  fromLevel: number;
  toLevel: number;
  materialId: number;
  quantity: number;
}
export const skillLevelCostsApi = makeChildRowHooks<SkillLevelCostRow>("skills/:parentId/level-costs");

export function useImportGameBundle() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/games/${game}/import`, { method: "POST", body: form });
      return jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", game] }),
  });
}

export function useImportCsv(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${basePath(game, config)}/import.csv`, { method: "POST", body: form });
      return jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", config.key] }),
  });
}

/** Reverse of jsonExportUrl — re-imports a per-table JSON export (or a hand-authored file in that same shape), upserting this entity's rows and any sub-item child rows it carries by natural key, same as the full-game bundle import. */
export function useImportJson(config: EntityConfig) {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${basePath(game, config)}/import.json`, { method: "POST", body: form });
      return jsonOrThrow(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master-data", config.key] }),
  });
}
