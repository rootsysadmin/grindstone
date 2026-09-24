import { useState } from "react";
import { TargetsTab } from "./TargetsTab.tsx";
import { SavingsRulesTab } from "./SavingsRulesTab.tsx";
import { PullHistoryTab } from "./PullHistoryTab.tsx";

const TABS = [
  { key: "targets", label: "Targets" },
  { key: "rules", label: "Savings rules" },
  { key: "history", label: "Pull history" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Mockup screens 05/22/23 — priority-ordered targets, the savings-rule engine, and per-target pull outcomes, sharing one computation layer (wishlistData.ts). */
export function WishlistPage() {
  const [tab, setTab] = useState<TabKey>("targets");

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <h1 className="font-display font-bold text-lg">Wishlist</h1>
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 font-sans font-semibold text-[11px] tracking-wide border-b-2 whitespace-nowrap ${
                tab === t.key ? "text-amber border-amber" : "text-text-dim border-transparent hover:text-text"
              }`}
            >
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        {tab === "targets" && <TargetsTab />}
        {tab === "rules" && <SavingsRulesTab />}
        {tab === "history" && <PullHistoryTab />}
      </div>
    </div>
  );
}
