import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SyncSettingsRow, SyncStatus, SyncSummary, UpdatePayload } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/** Stage 10 — community-sourced update sync. See apps/api/src/core/updateSync.ts. */
export function useSyncStatus() {
  const { slug: game } = useActiveGame();
  return useQuery<SyncStatus>({
    queryKey: ["sync-status", game],
    queryFn: () => fetch(`/api/games/${game}/sync/status`).then(jsonOrThrow),
  });
}

export function useRunCommunitySync() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetch(`/api/games/${game}/sync/community`, { method: "POST" }).then<SyncSummary>(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-status", game] });
      qc.invalidateQueries({ queryKey: ["redeem-codes", game] });
      qc.invalidateQueries({ queryKey: ["master-data", game] });
    },
  });
}

export function useApplyUpdate() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayload) => fetch(`/api/games/${game}/sync/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then<SyncSummary>(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-status", game] });
      qc.invalidateQueries({ queryKey: ["redeem-codes", game] });
      qc.invalidateQueries({ queryKey: ["master-data", game] });
    },
  });
}

/** App-wide, not per-game — one data repo covers every game, each in its own folder. */
export function useSyncSettings() {
  return useQuery<SyncSettingsRow>({
    queryKey: ["sync-settings"],
    queryFn: () => fetch(`/api/sync-settings`).then(jsonOrThrow),
  });
}

export function useUpdateSyncSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SyncSettingsRow>) => fetch(`/api/sync-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then<SyncSettingsRow>(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-settings"] }),
  });
}
