import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BattlePassProgressRow, EventProgressRow, RedeemCodeRow, TaskProgressRow, TaskRow } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import type { EventRewardRow } from "../master-data/api.ts";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// --- tasks -------------------------------------------------------------

export function useTasks() {
  const { slug: game } = useActiveGame();
  return useQuery<TaskRow[]>({
    queryKey: ["tasks", game],
    queryFn: () => fetch(`/api/games/${game}/tasks`).then(jsonOrThrow),
  });
}

export function useTaskProgress() {
  const { slug: game } = useActiveGame();
  return useQuery<TaskProgressRow[]>({
    queryKey: ["task-progress", game],
    queryFn: () => fetch(`/api/games/${game}/task-progress`).then(jsonOrThrow),
  });
}

export function useCreateTask() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", game] }),
  });
}

export function useUpdateTask() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", game] }),
  });
}

export function useDeleteTask() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/tasks/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", game] });
      qc.invalidateQueries({ queryKey: ["task-progress", game] });
    },
  });
}

/** Sets a task's current-period progress — credits/debits its reward to inventory server-side. See routes/tasks.ts. */
export function useUpdateTaskProgress() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, periodKey, current }: { id: number; periodKey: string; current: number }) =>
      fetch(`/api/games/${game}/tasks/${id}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodKey, current }),
      }).then<TaskProgressRow>(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-progress", game] });
      qc.invalidateQueries({ queryKey: ["inventory", game] });
    },
  });
}

// --- event progress ------------------------------------------------------

export function useEventProgress() {
  const { slug: game } = useActiveGame();
  return useQuery<EventProgressRow[]>({
    queryKey: ["event-progress", game],
    queryFn: () => fetch(`/api/games/${game}/event-progress`).then(jsonOrThrow),
  });
}

/** Flat "every reward row for this game" listing — lets the frontend know an event's completion target (does it have a real reward to claim?) without an N+1 fetch per event. */
export function useEventRewards() {
  const { slug: game } = useActiveGame();
  return useQuery<EventRewardRow[]>({
    queryKey: ["event-rewards", game],
    queryFn: () => fetch(`/api/games/${game}/event-rewards`).then(jsonOrThrow),
  });
}

export function useSetEventProgress() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, current }: { eventId: number; current: number }) =>
      fetch(`/api/games/${game}/event-progress/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-progress", game] }),
  });
}

// --- redeem codes ----------------------------------------------------------

export function useRedeemCodes() {
  const { slug: game } = useActiveGame();
  return useQuery<RedeemCodeRow[]>({
    queryKey: ["redeem-codes", game],
    queryFn: () => fetch(`/api/games/${game}/redeem-codes`).then(jsonOrThrow),
  });
}

export function useCreateRedeemCode() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; rewardLabel?: string | null }) =>
      fetch(`/api/games/${game}/redeem-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redeem-codes", game] }),
  });
}

export function useUpdateRedeemCode() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/redeem-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redeem-codes", game] }),
  });
}

export function useDeleteRedeemCode() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/redeem-codes/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["redeem-codes", game] }),
  });
}

// --- battle pass -----------------------------------------------------------

export function useBattlePassProgress() {
  const { slug: game } = useActiveGame();
  return useQuery<BattlePassProgressRow>({
    queryKey: ["battle-pass", game],
    queryFn: () => fetch(`/api/games/${game}/battle-pass`).then(jsonOrThrow),
  });
}

export function useSetBattlePassProgress() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentLevel: number; maxLevel: number; endDate: string | null }) =>
      fetch(`/api/games/${game}/battle-pass`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["battle-pass", game] }),
  });
}
