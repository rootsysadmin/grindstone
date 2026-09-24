import type { CurrencyInventoryRow, IncomeClaimRow, IncomeSourceRow, MasterDataRow } from "@grindstone/shared";
import { computeRemainingProjection, currencyBalance, pullsAvailable } from "../planner/materialNeeds.ts";

export interface BannerRunway {
  bannerId: number;
  bannerName: string;
  daysUntilEnd: number;
  pullsNow: number | null;
  pullsByEnd: number | null;
}

/**
 * "Ending soon" banners' pull runway — pure wiring over Stage 3's income
 * projection (computeRemainingProjection/currencyBalance/pullsAvailable,
 * reused directly rather than reimplemented). Picks the first currency
 * with a `pullCost` as "the gacha currency," the same simplification the
 * Currency tab already makes by treating each pull-cost currency
 * independently — real games generally have one primary gacha currency.
 */
export function computeRunway(
  banners: MasterDataRow[],
  currencies: MasterDataRow[],
  inventory: CurrencyInventoryRow[],
  incomeSources: IncomeSourceRow[],
  claims: IncomeClaimRow[],
  withinDays = 21,
  now: Date = new Date(),
): BannerRunway[] {
  const pullCurrency = currencies.find((c) => (c.pullCost as number | null) != null);
  if (!pullCurrency) return [];
  const pullCost = pullCurrency.pullCost as number;
  const currencyId = pullCurrency.id as number;
  const balance = currencyBalance(inventory, currencyId);
  const pullsNow = pullsAvailable(balance, pullCost);

  return banners
    .map((b) => {
      const endDate = b.endDate as string | null;
      if (!endDate) return null;
      const days = Math.ceil((new Date(endDate).getTime() - now.getTime()) / 86400000);
      if (days < 0 || days > withinDays) return null;
      const projected = incomeSources
        .filter((s) => s.currencyId === currencyId)
        .reduce((a, s) => a + computeRemainingProjection(s, claims, days), 0);
      const runway: BannerRunway = {
        bannerId: b.id as number,
        bannerName: b.name,
        daysUntilEnd: days,
        pullsNow,
        pullsByEnd: pullsAvailable(balance + projected, pullCost),
      };
      return runway;
    })
    .filter((x): x is BannerRunway => x !== null)
    .sort((a, b) => a.daysUntilEnd - b.daysUntilEnd);
}
