import { useState } from "react";
import { useAllGamesSpend } from "./api.ts";
import { OverviewTab } from "./OverviewTab.tsx";
import { TransactionsTab } from "./TransactionsTab.tsx";
import { SubscriptionsTab } from "./SubscriptionsTab.tsx";
import { BudgetTab } from "./BudgetTab.tsx";
import { ValueTab } from "./ValueTab.tsx";
import { AddPurchaseDialog } from "./AddPurchaseDialog.tsx";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "transactions", label: "Transactions" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "budget", label: "Budget" },
  { key: "value", label: "Value" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Mockup screens 32-36 — real-money spend, tracked across every configured
 * game at once (see api.ts's useAllGamesSpend for why this is the app's one
 * cross-game feature). All five tabs read from the single fetch here.
 */
export function SpendPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [addPurchase, setAddPurchase] = useState(false);
  const { data, isLoading } = useAllGamesSpend();

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display font-bold text-lg">Spend</h1>
          <span className="font-mono text-[9px] bg-green/15 border border-green/40 text-green px-1.5 py-0.5 rounded tracking-wide">ALL GAMES</span>
          <span className="font-mono text-xs text-text-faint">
            {data ? `${data.games.length} tracked` : "loading…"} · entries are manual, real-money purchases
          </span>
          <div className="flex-1" />
          <button onClick={() => setAddPurchase(true)} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium">
            + PURCHASE
          </button>
        </div>
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 font-sans font-semibold text-[11px] tracking-wide border-b-2 whitespace-nowrap ${
                tab === t.key ? "text-green border-green" : "text-text-dim border-transparent hover:text-text"
              }`}
            >
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        {isLoading && <div className="text-text-dim text-sm">Loading…</div>}
        {data && (
          <>
            {tab === "overview" && <OverviewTab data={data} />}
            {tab === "transactions" && <TransactionsTab data={data} />}
            {tab === "subscriptions" && <SubscriptionsTab data={data} />}
            {tab === "budget" && <BudgetTab data={data} />}
            {tab === "value" && <ValueTab data={data} />}
          </>
        )}
      </div>
      {addPurchase && <AddPurchaseDialog games={data?.games ?? []} budgets={data?.budgets ?? []} onClose={() => setAddPurchase(false)} />}
    </div>
  );
}
