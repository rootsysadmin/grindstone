import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FarmRouteEntryRow, IncomeClaimRow, IncomeSourceRow, InventoryResponse } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import type { CharacterLevelCostRow, EquipmentLevelCostRow, SkillLevelCostRow } from "../master-data/api.ts";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function useInventory() {
  const { slug: game } = useActiveGame();
  return useQuery<InventoryResponse>({
    queryKey: ["inventory", game],
    queryFn: () => fetch(`/api/games/${game}/inventory`).then(jsonOrThrow),
  });
}

export function useSetMaterialStock() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ materialId, quantity }: { materialId: number; quantity: number }) =>
      fetch(`/api/games/${game}/inventory/materials/${materialId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", game] }),
  });
}

export function useSetCurrencyBalance() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ currencyId, balance }: { currencyId: number; balance: number }) =>
      fetch(`/api/games/${game}/inventory/currencies/${currencyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", game] }),
  });
}

// Flat "every row for this game" listings of the level-cost schedules —
// used by the global Materials planner (and the character Materials tab)
// to derive remaining need. See materialNeeds.ts.
export function useCharacterLevelCosts() {
  const { slug: game } = useActiveGame();
  return useQuery<CharacterLevelCostRow[]>({
    queryKey: ["character-level-costs", game],
    queryFn: () => fetch(`/api/games/${game}/character-level-costs`).then(jsonOrThrow),
  });
}

export function useEquipmentLevelCosts() {
  const { slug: game } = useActiveGame();
  return useQuery<EquipmentLevelCostRow[]>({
    queryKey: ["equipment-level-costs", game],
    queryFn: () => fetch(`/api/games/${game}/equipment-level-costs`).then(jsonOrThrow),
  });
}

export function useSkillLevelCosts() {
  const { slug: game } = useActiveGame();
  return useQuery<SkillLevelCostRow[]>({
    queryKey: ["skill-level-costs", game],
    queryFn: () => fetch(`/api/games/${game}/skill-level-costs`).then(jsonOrThrow),
  });
}

export function useIncomeSources() {
  const { slug: game } = useActiveGame();
  return useQuery<IncomeSourceRow[]>({
    queryKey: ["income-sources", game],
    queryFn: () => fetch(`/api/games/${game}/income-sources`).then(jsonOrThrow),
  });
}

export function useCreateIncomeSource() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/income-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources", game] }),
  });
}

export function useUpdateIncomeSource() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/income-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources", game] }),
  });
}

export function useDeleteIncomeSource() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/income-sources/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income-sources", game] }),
  });
}

export function useIncomeClaims() {
  const { slug: game } = useActiveGame();
  return useQuery<IncomeClaimRow[]>({
    queryKey: ["income-claims", game],
    queryFn: () => fetch(`/api/games/${game}/income-claims`).then(jsonOrThrow),
  });
}

export function useClaimIncomeSource() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/income-sources/${id}/claim`, { method: "POST" }).then(jsonOrThrow),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income-claims", game] });
      qc.invalidateQueries({ queryKey: ["inventory", game] });
    },
  });
}

export function useFarmRoute() {
  const { slug: game } = useActiveGame();
  return useQuery<FarmRouteEntryRow[]>({
    queryKey: ["farm-route", game],
    queryFn: () => fetch(`/api/games/${game}/farm-route`).then(jsonOrThrow),
  });
}

export function useCreateFarmRouteEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/games/${game}/farm-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm-route", game] }),
  });
}

export function useUpdateFarmRouteEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/farm-route/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm-route", game] }),
  });
}

export function useDeleteFarmRouteEntry() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/games/${game}/farm-route/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm-route", game] }),
  });
}

export function useReorderFarmRoute() {
  const { slug: game } = useActiveGame();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      fetch(`/api/games/${game}/farm-route/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).then(jsonOrThrow),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["farm-route", game] }),
  });
}
