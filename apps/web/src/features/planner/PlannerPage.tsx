import { useState } from "react";
import { CurrencyTab } from "./CurrencyTab.tsx";
import { MaterialsTab } from "./MaterialsTab.tsx";
import { FarmRouteTab } from "./FarmRouteTab.tsx";
import { IncomeSourcesTab } from "./IncomeSourcesTab.tsx";
import { GearTab } from "./GearTab.tsx";
import { InventoryQuickEditDialog } from "./InventoryQuickEditDialog.tsx";

const TABS = [
  { key: "currency", label: "Currency" },
  { key: "materials", label: "Materials" },
  { key: "gear", label: "Gear" },
  { key: "farm-route", label: "Farm Route" },
  { key: "income", label: "Income Sources" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function PlannerPage() {
  const [tab, setTab] = useState<TabKey>("currency");
  const [quickEdit, setQuickEdit] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display font-bold text-lg">Resource planner</h1>
          <div className="flex-1" />
          <button
            onClick={() => setQuickEdit(true)}
            className="font-mono text-[10px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-text-dim hover:text-text"
          >
            QUICK EDIT
          </button>
        </div>
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
        {tab === "currency" && <CurrencyTab />}
        {tab === "materials" && <MaterialsTab />}
        {tab === "gear" && <GearTab />}
        {tab === "farm-route" && <FarmRouteTab />}
        {tab === "income" && <IncomeSourcesTab />}
      </div>
      {quickEdit && <InventoryQuickEditDialog onClose={() => setQuickEdit(false)} />}
    </div>
  );
}
