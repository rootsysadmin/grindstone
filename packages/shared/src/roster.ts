// Stage 2 — roster/build/team API shapes. Deliberately plain interfaces,
// not entityConfigs-driven like masterData.ts: these are user-state (no
// source/status/draft-publish), not master-data catalog rows, so they
// don't go through the generic table/record-editor system.

export interface CharacterBuild {
  id: number;
  characterId: number;
  level: number;
  resonanceLevel: number;
  equippedEquipmentItemId: number | null;
  equippedEquipmentLevel: number | null;
  equippedEquipmentRefinement: number | null;
  notes: string | null;
  pinned: boolean;
  ownedAt: number;
  updatedAt: number;
}

export interface SkillLevelEntry {
  skillId: number;
  level: number;
}

export interface StatTargetRow {
  id: number;
  characterId: number;
  statName: string;
  targetValue: string | null;
  currentValue: string | null;
}

/** One row of the roster grid/list — a character joined with its (possibly absent) build state. */
export interface RosterEntry {
  character: {
    id: number;
    slug: string;
    name: string;
    rankTierId: number | null;
    elementId: number | null;
    role: string | null;
    maxAugmentSlots: number | null;
    imageUrl: string | null;
  };
  build: CharacterBuild | null;
  equippedAugmentCount: number;
  skillLevels: SkillLevelEntry[];
  statTargets: StatTargetRow[];
}

export interface OwnedAugmentRow {
  id: number;
  moduleId: number;
  mainStat: string | null;
  substats: string | null; // JSON: { stat: string, value: string }[]
  level: number | null;
  characterId: number | null; // null = in bag
  slotIndex: number | null;
  acquiredAt: number;
}

export interface Team {
  id: number;
  name: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TeamMemberRow {
  id: number;
  teamId: number;
  characterId: number;
  roleLabel: string | null;
  sortOrder: number;
}

export interface TeamWithMembers extends Team {
  members: TeamMemberRow[];
}
