// Stage 10 — community-sourced update sync. See apps/api/src/core/updateSync.ts
// for the provenance-safe upsert this drives, and docs/progress.md's Stage 10
// entry for why this pulls from a community data repo instead of an official
// feed (none exists for either seeded game).

export type UpdateKind = "code" | "banner" | "event" | "level-costs";

/**
 * A reward line inside a code/event update — always a slug reference, never
 * a raw numeric id, since a community-repo JSON file has to mean the same
 * thing on every install's own database (same reason gameBundle.ts's
 * export/import format references every relation by slug). Resolved to a
 * real currencyId/materialId server-side in updateSync.ts; a slug that
 * doesn't match anything in this install's master data is dropped, not
 * treated as a failure of the whole update.
 */
export interface RewardDraft {
  kind: "currency" | "material";
  currencySlug?: string | null;
  materialSlug?: string | null;
  quantity: number;
}

/** One entry inside a community-repo update file, or a locally-drafted one from LogUpdateDialog — same shape either way, since both go through the same apply route. */
export interface CodeUpdatePayload {
  kind: "code";
  code: string;
  rewardLabel?: string | null; // free-text description only — the compact Overview quick-add stays this-only, see docs/progress.md
  rewards?: RewardDraft[]; // structured, real, credited to inventory when the code is marked redeemed
}

/**
 * A banner introducing a brand-new character/weapon (the common case — new
 * ones debut via banners, not a separate announcement) creates it, rather
 * than leaving featuredCharacterId null because nothing local matches the
 * slug yet — see docs/progress.md's Stage 10 follow-up. Deliberately a
 * small, honest field set: things a banner announcement actually states,
 * not deep-kit details (ascension material, augment slots) that only
 * surface later and stay fillable by hand same as any other field.
 */
export interface NewCharacterDraft {
  name: string;
  rank?: string | null;
  elementSlug?: string | null;
  role?: string | null;
  releaseDate?: string | null;
}

export interface NewEquipmentDraft {
  name: string;
  rank?: string | null;
  type?: string | null;
  mainStat?: string | null;
}

export interface BannerUpdatePayload {
  kind: "banner";
  name: string; // slug is always derived from name server-side, matching the master-data editor's own convention
  type?: string | null;
  featuredCharacterSlug?: string | null; // links to an existing character — ignored if newCharacter is set
  featuredEquipmentSlug?: string | null;
  newCharacter?: NewCharacterDraft | null; // this banner introduces/redefines this character — created or updated, then linked
  newEquipment?: NewEquipmentDraft | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface EventUpdatePayload {
  kind: "event";
  name: string; // slug is always derived from name server-side
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null; // free-text context/mechanic notes — rewards are structured separately below
  rewards?: RewardDraft[];
}

/**
 * Materials introduced by a level-cost update that don't exist locally yet
 * — same "small honest field set" convention as NewCharacterDraft/
 * NewEquipmentDraft: name and category are realistically known from an
 * announcement/datamine; rank tier (now a per-game rankTiers relation, not
 * a fixed number — see docs/progress.md's rank-tiers entry) and
 * weeklyCap/craftsIntoId/alternativeMaterialId stay fillable by hand later,
 * same as ascensionMaterialId on a new character.
 */
export interface NewMaterialDraft {
  name: string;
  category?: string | null;
}

/**
 * One level-up cost band. Matched to an existing row (if any) by a natural
 * key rather than full-replaced like codeRewards/eventRewards — individual
 * bands stay independently hand-correctable via the level-costs child-row
 * editor, see updateSync.ts. Two kinds share this shape (`kind` defaults to
 * "material" when omitted, for back-compat with existing community-repo
 * files written before EXP rows existed):
 * - "material" (default): a specific ascension material — natural key is
 *   (target id, fromLevel, toLevel, materialId), needs materialSlug/quantity.
 * - "exp": a flat EXP amount, fillable by any combination of that entity's
 *   EXP-pool materials — natural key is (target id, fromLevel, toLevel,
 *   kind), needs expAmount. Only meaningful for character/equipment targets
 *   — skills stay material-only, an exp-kind band targeting a skill is
 *   dropped.
 */
export interface LevelCostBandDraft {
  fromLevel: number;
  toLevel: number;
  kind?: "material" | "exp";
  materialSlug?: string | null; // required when kind is "material" (or omitted)
  quantity?: number | null; // required when kind is "material" (or omitted)
  expAmount?: number | null; // required when kind is "exp"
}

/**
 * Attaches material-requirement data to a character/equipment/skill that
 * already exists locally — this never creates the parent itself (a banner's
 * newCharacter/newEquipment is what does that), since cost data realistically
 * surfaces well after a debut, as its own separate discovery event.
 */
export interface LevelCostUpdatePayload {
  kind: "level-costs";
  targetKind: "character" | "equipment" | "skill";
  targetSlug: string;
  newMaterials?: NewMaterialDraft[];
  bands: LevelCostBandDraft[];
}

export type UpdatePayload = CodeUpdatePayload | BannerUpdatePayload | EventUpdatePayload | LevelCostUpdatePayload;

export interface CodeRewardRow {
  id: number;
  kind: "currency" | "material";
  currencyId: number | null;
  materialId: number | null;
  quantity: number | null;
}

export interface SyncSummary {
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncRunRow {
  id: number;
  source: "community" | "manual";
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  createdAt: number;
}

export interface SyncStatus {
  lastRun: SyncRunRow | null;
}

export interface SyncSettingsRow {
  dataRepoOwner: string | null;
  dataRepoName: string | null;
}
