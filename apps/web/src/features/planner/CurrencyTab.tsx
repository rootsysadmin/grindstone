import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useIncomeClaims, useIncomeSources, useInventory, useSetCurrencyBalance } from "./api.ts";
import { computeRemainingProjection, currencyBalance, pullsAvailable } from "./materialNeeds.ts";

const WINDOWS = [7, 30, 90] as const;

export function CurrencyTab() {
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const { data: inventory } = useInventory();
  const { data: sources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const setBalance = useSetCurrencyBalance();
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(30);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-faint">projection window</span>
        <div className="flex gap-1 bg-white/5 rounded-md p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              className={`text-[11px] font-mono px-2 py-1 rounded ${windowDays === w ? "bg-amber text-ink" : "text-text-dim"}`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {currencies.map((c) => {
          const balance = currencyBalance(inventory?.currencies ?? [], c.id as number);
          // Honest, not blind: actual balance already reflects whatever's
          // been claimed, so this only projects periods still ahead in the
          // window instead of multiplying cadence x amount regardless of
          // what you've already gotten credit for.
          const income = sources
            .filter((s) => s.currencyId === c.id)
            .reduce((a, s) => a + computeRemainingProjection(s, claims, windowDays), 0);
          const pullCost = c.pullCost as number | null;
          const pulls = pullsAvailable(balance, pullCost);
          const pullsAfter = pullCost ? pullsAvailable(balance + income, pullCost) : null;
          return (
            <div key={c.id} className="bg-surface border border-border2 rounded-lg p-3 flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wide text-text-faint">{c.name}</span>
              <input
                key={balance}
                type="number"
                min={0}
                defaultValue={balance}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 font-display font-bold text-lg"
                onBlur={(e) => setBalance.mutate({ currencyId: c.id as number, balance: Math.max(0, Number(e.target.value)) })}
              />
              <span className="font-mono text-[10px] text-text-dim">+{Math.round(income).toLocaleString()} / {windowDays}d</span>
              {pulls !== null && (
                <span className="font-mono text-[10px] text-amber">
                  {pulls} pulls available{pullsAfter !== null && pullsAfter !== pulls ? ` → ${pullsAfter}` : ""}
                </span>
              )}
            </div>
          );
        })}
        {currencies.length === 0 && <div className="col-span-4 text-xs text-text-faint">No currencies in master data yet.</div>}
      </div>
    </div>
  );
}
