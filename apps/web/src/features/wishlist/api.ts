import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavingsRuleOverrideRow, SavingsRuleRow, WishlistTargetRow } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// --- wishlist targets ------------------------------------------------------

export function useWishlistTargets() {
  const { slug: game } = useActiveGame();
  return useQuery<WishlistTargetRow[]>({
    queryKey: ["wishlist-targets", game],
    queryFn: () => fetch(`/api/games/${game}/wishlist-targets`).then(jsonOrThrow),
  });
}

function invalidateTargets(qc: ReturnType<typeof useQueryClient>, game: string) {
  qc.invalidateQueries({ queryKey: ["wishlist-targets", game] });
}

export function useCreateWishlistTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/wishlist-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

export function useUpdateWishlistTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/wishlist-targets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

export function useDeleteWishlistTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/wishlist-targets/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

export function useReorderWishlistTargets() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      fetch(`/api/games/${game}/wishlist-targets/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

export function useSetTargetStatus() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: WishlistTargetRow["status"] }) =>
      fetch(`/api/games/${game}/wishlist-targets/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

export function useLockTarget() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: WishlistTargetRow["lockedDecision"] }) =>
      fetch(`/api/games/${game}/wishlist-targets/${id}/lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateTargets(qc, game),
  });
}

// --- savings rules -----------------------------------------------------------

export function useSavingsRules() {
  const { slug: game } = useActiveGame();
  return useQuery<SavingsRuleRow[]>({
    queryKey: ["savings-rules", game],
    queryFn: () => fetch(`/api/games/${game}/savings-rules`).then(jsonOrThrow),
  });
}

function invalidateRules(qc: ReturnType<typeof useQueryClient>, game: string) {
  qc.invalidateQueries({ queryKey: ["savings-rules", game] });
}

export function useCreateSavingsRule() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/savings-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateRules(qc, game),
  });
}

export function useUpdateSavingsRule() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/savings-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateRules(qc, game),
  });
}

export function useDeleteSavingsRule() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/savings-rules/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidateRules(qc, game),
  });
}

export function useReorderSavingsRules() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      fetch(`/api/games/${game}/savings-rules/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateRules(qc, game),
  });
}

export function useRuleOverrides() {
  const { slug: game } = useActiveGame();
  return useQuery<SavingsRuleOverrideRow[]>({
    queryKey: ["savings-rule-overrides", game],
    queryFn: () => fetch(`/api/games/${game}/savings-rule-overrides`).then(jsonOrThrow),
  });
}

export function useDeleteRuleOverride() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/savings-rule-overrides/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule-overrides", game] }),
  });
}

export function useOverrideRule() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetId, note }: { id: number; targetId?: number; note?: string }) =>
      fetch(`/api/games/${game}/savings-rules/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, note }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule-overrides", game] }),
  });
}
