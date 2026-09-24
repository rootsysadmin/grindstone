import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CharacterBuild,
  GameSettings,
  OwnedAugmentRow,
  RosterEntry,
  SkillLevelEntry,
  Team,
  TeamMemberRow,
  TeamWithMembers,
} from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function useRoster() {
  const { slug: game } = useActiveGame();
  return useQuery<RosterEntry[]>({
    queryKey: ["roster", game],
    queryFn: () => fetch(`/api/games/${game}/roster`).then(jsonOrThrow),
  });
}

/**
 * Per-game progression caps — a real DB row, editable via
 * PATCH /api/games/:game/settings (no frontend UI for that yet, API-only
 * by the user's choice), not static GameConfig. See
 * packages/shared/src/gameSettings.ts.
 */
export function useGameSettings() {
  const { slug: game } = useActiveGame();
  return useQuery<GameSettings>({
    queryKey: ["game-settings", game],
    queryFn: () => fetch(`/api/games/${game}/settings`).then(jsonOrThrow),
  });
}

export interface SaveBuildBody {
  level: number;
  resonanceLevel: number;
  equippedEquipmentItemId: number | null;
  equippedEquipmentLevel: number | null;
  equippedEquipmentRefinement: number | null;
  notes: string | null;
  skillLevels: SkillLevelEntry[];
}

export function useSaveBuild() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, body }: { characterId: number; body: SaveBuildBody }) =>
      fetch(`/api/games/${game}/roster/${characterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then<CharacterBuild>(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", game] }),
  });
}

/** Today Overview's roster rollup shows a chosen subset — separate from useSaveBuild so pinning never risks clobbering the rest of a build. */
export function usePinCharacter() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, pinned }: { characterId: number; pinned: boolean }) =>
      fetch(`/api/games/${game}/roster/${characterId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      }).then<CharacterBuild>(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", game] }),
  });
}

/** One-click "mark owned" with honest minimal defaults (level 1, no equipment, no skills) — no fabricated starting-ring claim, just the plain default state a fresh owner actually has. Used by both the roster grid's hover affordance and the detail page's MARK OWNED button. */
export function useQuickOwnCharacter() {
  const saveBuild = useSaveBuild();
  return {
    ...saveBuild,
    mutate: (characterId: number) =>
      saveBuild.mutate({
        characterId,
        body: {
          level: 1,
          resonanceLevel: 0,
          equippedEquipmentItemId: null,
          equippedEquipmentLevel: null,
          equippedEquipmentRefinement: null,
          notes: null,
          skillLevels: [],
        },
      }),
  };
}

export function useUnownCharacter() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (characterId: number) => fetch(`/api/games/${game}/roster/${characterId}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", game] }),
  });
}

export function useAugments(params: { moduleId?: number; characterId?: number; unequipped?: boolean } = {}) {
  const { slug: game } = useActiveGame();
  const qs = new URLSearchParams();
  if (params.moduleId !== undefined) qs.set("moduleId", String(params.moduleId));
  if (params.characterId !== undefined) qs.set("characterId", String(params.characterId));
  if (params.unequipped) qs.set("unequipped", "true");
  const query = qs.toString();
  return useQuery<OwnedAugmentRow[]>({
    queryKey: ["augments", game, params],
    queryFn: () => fetch(`/api/games/${game}/augments${query ? `?${query}` : ""}`).then(jsonOrThrow),
  });
}

export function useCreateAugment() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { moduleId: number; mainStat?: string | null; substats?: string | null; level?: number | null }) =>
      fetch(`/api/games/${game}/augments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then<OwnedAugmentRow>(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["augments", game] }),
  });
}

export function useUpdateAugment() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/augments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["augments", game] }),
  });
}

export function useDeleteAugment() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/augments/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["augments", game] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}

export function useEquipAugment() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, characterId, slotIndex }: { id: number; characterId: number; slotIndex: number }) =>
      fetch(`/api/games/${game}/augments/${id}/equip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, slotIndex }),
      }).then<{ augment: OwnedAugmentRow; bumped: OwnedAugmentRow | null }>(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["augments", game] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}

export function useUnequipAugment() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/augments/${id}/unequip`, { method: "POST" }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["augments", game] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}

export function useTeams(characterId?: number) {
  const { slug: game } = useActiveGame();
  const qs = characterId !== undefined ? `?characterId=${characterId}` : "";
  return useQuery<TeamWithMembers[]>({
    queryKey: ["teams", game, characterId ?? null],
    queryFn: () => fetch(`/api/games/${game}/teams${qs}`).then(jsonOrThrow),
  });
}

export function useCreateTeam() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; notes?: string | null }) =>
      fetch(`/api/games/${game}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then<Team>(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", game] }),
  });
}

export function useUpdateTeam() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", game] }),
  });
}

export function useDeleteTeam() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/teams/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", game] }),
  });
}

export function useTeamMembers(teamId: number | null) {
  const { slug: game } = useActiveGame();
  return useQuery<TeamMemberRow[]>({
    queryKey: ["team-members", game, teamId],
    queryFn: () => fetch(`/api/games/${game}/teams/${teamId}/members`).then(jsonOrThrow),
    enabled: teamId !== null,
  });
}

export function useAddTeamMember() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, body }: { teamId: number; body: { characterId: number; roleLabel?: string | null; sortOrder?: number } }) =>
      fetch(`/api/games/${game}/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then<TeamMemberRow>(jsonOrThrow),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["team-members", game, vars.teamId] });
      qc.invalidateQueries({ queryKey: ["teams", game] });
    },
  });
}

export function useRemoveTeamMember() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, id }: { teamId: number; id: number }) =>
      fetch(`/api/games/${game}/teams/${teamId}/members/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["team-members", game, vars.teamId] });
      qc.invalidateQueries({ queryKey: ["teams", game] });
    },
  });
}

export function useStatTargets(characterId: number | null) {
  const { slug: game } = useActiveGame();
  return useQuery<import("@grindstone/shared").StatTargetRow[]>({
    queryKey: ["stat-targets", game, characterId],
    queryFn: () => fetch(`/api/games/${game}/characters/${characterId}/stat-targets`).then(jsonOrThrow),
    enabled: characterId !== null,
  });
}

export function useAddStatTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, body }: { characterId: number; body: { statName: string; targetValue?: string | null; currentValue?: string | null } }) =>
      fetch(`/api/games/${game}/characters/${characterId}/stat-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["stat-targets", game, vars.characterId] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}

export function useUpdateStatTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, id, body }: { characterId: number; id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/characters/${characterId}/stat-targets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["stat-targets", game, vars.characterId] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}

export function useDeleteStatTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ characterId, id }: { characterId: number; id: number }) =>
      fetch(`/api/games/${game}/characters/${characterId}/stat-targets/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["stat-targets", game, vars.characterId] });
      qc.invalidateQueries({ queryKey: ["roster", game] });
    },
  });
}
