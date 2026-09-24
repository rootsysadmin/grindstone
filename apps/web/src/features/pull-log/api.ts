import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PityPoolState, PullLogRow } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function usePullLog() {
  const { slug: game } = useActiveGame();
  return useQuery<PullLogRow[]>({
    queryKey: ["pull-log", game],
    queryFn: () => fetch(`/api/games/${game}/pull-log`).then(jsonOrThrow),
  });
}

export function usePityState() {
  const { slug: game } = useActiveGame();
  return useQuery<PityPoolState[]>({
    queryKey: ["pull-log", game, "pity"],
    queryFn: () => fetch(`/api/games/${game}/pull-log/pity`).then(jsonOrThrow),
  });
}

function invalidatePullLog(qc: ReturnType<typeof useQueryClient>, game: string) {
  qc.invalidateQueries({ queryKey: ["pull-log", game] });
}

export function useCreatePullLogEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/pull-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidatePullLog(qc, game),
  });
}

export function useUpdatePullLogEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/pull-log/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidatePullLog(qc, game),
  });
}

export function useDeletePullLogEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/pull-log/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidatePullLog(qc, game),
  });
}
