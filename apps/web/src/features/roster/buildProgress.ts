import type { RosterEntry } from "@grindstone/shared";

/**
 * Build-completion ring math — deliberately client-side. It needs each
 * game's numeric caps (maxCharacterLevel, etc.), which live in
 * games/<slug>/config.ts; that's easy to import here (Vite/Bundler
 * resolution, via useActiveGame()) but awkward from apps/api (NodeNext +
 * a `rootDir: "src"` build that config.ts sits outside of) — so the API
 * just serves raw state (roster.ts) and this is the one place that turns
 * it into percentages. Never stored, so it can't drift from the state
 * it's derived from.
 */

export interface RingSegment {
  key: "levels" | "modules" | "skills" | "arc" | "stats";
  label: string;
  color: "amber" | "pink" | "blue" | "purple" | "green";
  /** 0-1, or null if this segment doesn't apply to this character (excluded from the ring rather than counted as 0). */
  fraction: number | null;
}

export interface RingResult {
  segments: RingSegment[];
  /** 0-100, integer. */
  overall: number;
}

/** The caps this page needs — maxResonanceLevel isn't read by the ring itself (see "levels" below) but the Build tab's Awakening stepper still needs it. */
export interface RingCaps {
  maxCharacterLevel: number;
  maxResonanceLevel: number;
  maxSkillLevel: number;
  maxEquipmentLevel: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Parses the leading numeric portion of a free-text stat value, e.g. "218%" -> 218, "2,946" -> 2946. Returns null if nothing numeric is found. */
export function parseLeadingNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const match = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

const EMPTY_SEGMENTS: RingSegment[] = [
  { key: "levels", label: "Levels", color: "amber", fraction: null },
  { key: "modules", label: "Modules", color: "pink", fraction: null },
  { key: "skills", label: "Skills", color: "blue", fraction: null },
  { key: "arc", label: "Arc", color: "purple", fraction: null },
  { key: "stats", label: "Stats", color: "green", fraction: null },
];

/** A skill as far as the ring cares: its id and its own max-level override, if any (null = use the game's flat maxSkillLevel). */
export interface CharacterSkillCap {
  id: number;
  maxLevel: number | null;
}

/** @param characterSkills every skill this character has on record in master data (Stage 1's skills.characterId), used as the denominator — a skill with no character_skill_levels row counts as level 0, not "not applicable." */
export function computeBuildRing(entry: RosterEntry, caps: RingCaps, characterSkills: CharacterSkillCap[]): RingResult {
  const build = entry.build;
  if (!build) return { segments: EMPTY_SEGMENTS, overall: 0 };

  // Character level only — no ascension (not tracked at all; it's a
  // natural byproduct of leveling, not a separate goal) and no
  // Awakening/resonance (still tracked and shown, but deliberately not a
  // 100%-completion requirement — it's often money-gated, not skill/gear
  // progress, per the user).
  const levels = clamp01(build.level / caps.maxCharacterLevel);

  const modules = entry.character.maxAugmentSlots
    ? clamp01(entry.equippedAugmentCount / entry.character.maxAugmentSlots)
    : null;

  let skills: number | null = null;
  if (characterSkills.length > 0) {
    const levelBySkill = new Map(entry.skillLevels.map((s) => [s.skillId, s.level]));
    const sum = characterSkills.reduce((acc, s) => {
      const cap = s.maxLevel ?? caps.maxSkillLevel;
      return acc + clamp01((levelBySkill.get(s.id) ?? 0) / cap);
    }, 0);
    skills = sum / characterSkills.length;
  }

  // Fractional on the equipped item's own level, not just "is something
  // equipped" — a level-1 Arc equipped shouldn't read as done.
  const arc = build.equippedEquipmentItemId ? clamp01((build.equippedEquipmentLevel ?? 0) / caps.maxEquipmentLevel) : 0;

  // Fractional per stat (current/target, capped at 1) rather than a binary
  // met/not-met count — a stat that's 9/10 of the way there should show as
  // meaningful progress, not zero.
  let stats: number | null = null;
  const parsedTargets = entry.statTargets
    .map((t) => ({ target: parseLeadingNumber(t.targetValue), current: parseLeadingNumber(t.currentValue) }))
    .filter((t): t is { target: number; current: number | null } => t.target !== null && t.target !== 0);
  if (parsedTargets.length > 0) {
    const sum = parsedTargets.reduce((acc, t) => acc + clamp01((t.current ?? 0) / t.target), 0);
    stats = sum / parsedTargets.length;
  }

  const segments: RingSegment[] = [
    { key: "levels", label: "Levels", color: "amber", fraction: levels },
    { key: "modules", label: "Modules", color: "pink", fraction: modules },
    { key: "skills", label: "Skills", color: "blue", fraction: skills },
    { key: "arc", label: "Arc", color: "purple", fraction: arc },
    { key: "stats", label: "Stats", color: "green", fraction: stats },
  ];

  const active = segments.filter((s): s is RingSegment & { fraction: number } => s.fraction !== null);
  const overall = active.length > 0 ? Math.round((active.reduce((a, s) => a + s.fraction, 0) / active.length) * 100) : 0;

  return { segments, overall };
}
