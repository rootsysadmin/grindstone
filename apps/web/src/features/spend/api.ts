import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GameConfig,
  IncomeClaimRow,
  IncomeSourceRow,
  MasterDataRow,
  PullLogRow,
  PurchaseRow,
  SpendBudgetOverrideRow,
  SpendBudgetRow,
  SpendGameSettingsRow,
  SpendSubscriptionRow,
} from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// --- cross-game read (the one genuinely new pattern this stage adds) -------
//
// Every other feature in this app reads/writes one active game at a time.
// Spend has to be seen across every configured game at once, so this single
// hook fans out over `allConfigs` and merges — the fan-out logic exists here
// and nowhere else; every Spend tab is built on top of this one hook.

export interface GameSpendData {
  config: GameConfig;
  purchases: PurchaseRow[];
  subscriptions: SpendSubscriptionRow[];
  pullLog: PullLogRow[];
  currencies: MasterDataRow[];
  incomeSources: IncomeSourceRow[];
  incomeClaims: IncomeClaimRow[];
  settings: SpendGameSettingsRow;
  /** This game's strongest rank tier's name (highest level) — pull_log.rank is a frozen text snapshot, matched against this by name for the $/top-rank stat. Replaces the old gameConfig.ranks[0]. */
  topRankName: string | null;
}

export interface AllGamesSpend {
  games: GameSpendData[];
  budgets: SpendBudgetRow[];
  budgetOverrides: SpendBudgetOverrideRow[];
}

async function fetchGameSpend(config: GameConfig): Promise<GameSpendData> {
  const { slug } = config;
  const [purchases, subscriptions, pullLog, currencies, incomeSources, incomeClaims, settings, rankTiers] = await Promise.all([
    fetch(`/api/games/${slug}/purchases`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/spend-subscriptions`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/pull-log`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/currencies`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/income-sources`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/income-claims`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/spend-settings`).then(jsonOrThrow),
    fetch(`/api/games/${slug}/rank-tiers`).then(jsonOrThrow) as Promise<{ name: string; level: number }[]>,
  ]);
  const topRankName = rankTiers.length > 0 ? rankTiers.reduce((a, b) => (b.level > a.level ? b : a)).name : null;
  return { config, purchases, subscriptions, pullLog, currencies, incomeSources, incomeClaims, settings, topRankName };
}

export function useAllGamesSpend() {
  const { allConfigs } = useActiveGame();
  const slugs = allConfigs.map((g) => g.slug).join(",");
  return useQuery<AllGamesSpend>({
    queryKey: ["spend-all-games", slugs],
    queryFn: async () => {
      const games = await Promise.all(allConfigs.map(fetchGameSpend));
      // Budgets/overrides: spend-budgets returns platform-wide + that game's
      // own rows per call, so dedupe by id across the fan-out.
      const budgetLists = await Promise.all(allConfigs.map((g) => fetch(`/api/games/${g.slug}/spend-budgets`).then(jsonOrThrow) as Promise<SpendBudgetRow[]>));
      const budgetsById = new Map<number, SpendBudgetRow>();
      for (const list of budgetLists) for (const b of list) budgetsById.set(b.id, b);
      const overrideLists = await Promise.all(
        allConfigs.map((g) => fetch(`/api/games/${g.slug}/spend-budget-overrides`).then(jsonOrThrow) as Promise<SpendBudgetOverrideRow[]>),
      );
      return { games, budgets: [...budgetsById.values()], budgetOverrides: overrideLists.flat() };
    },
    enabled: allConfigs.length > 0,
  });
}

function invalidateAllGamesSpend(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["spend-all-games"] });
}

// --- per-game writes (mutations always act on one game at a time) ---------

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, body }: { game: string; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id, body }: { game: string; id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/purchases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id }: { game: string; id: number }) => fetch(`/api/games/${game}/purchases/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useCreateSpendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, body }: { game: string; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/spend-subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useUpdateSpendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id, body }: { game: string; id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/spend-subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useCancelSpendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id }: { game: string; id: number }) =>
      fetch(`/api/games/${game}/spend-subscriptions/${id}/cancel`, { method: "POST" }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useDeleteSpendSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id }: { game: string; id: number }) =>
      fetch(`/api/games/${game}/spend-subscriptions/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useLinkSubscriptionIncomeSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id }: { game: string; id: number }) =>
      fetch(`/api/games/${game}/spend-subscriptions/${id}/link-income-source`, { method: "POST" }).then(jsonOrThrow),
    onSuccess: () => {
      invalidateAllGamesSpend(qc);
      qc.invalidateQueries({ queryKey: ["income-sources"] });
    },
  });
}

export function useCreateSpendBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, body }: { game: string; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/spend-budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useUpdateSpendBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id, body }: { game: string; id: number; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/spend-budgets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useDeleteSpendBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, id }: { game: string; id: number }) => fetch(`/api/games/${game}/spend-budgets/${id}`, { method: "DELETE" }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useCreateSpendBudgetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, budgetId, note }: { game: string; budgetId: number; note?: string }) =>
      fetch(`/api/games/${game}/spend-budget-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetId, note }),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}

export function useUpdateSpendSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ game, body }: { game: string; body: Record<string, unknown> }) =>
      fetch(`/api/games/${game}/spend-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(jsonOrThrow),
    onSuccess: () => invalidateAllGamesSpend(qc),
  });
}
