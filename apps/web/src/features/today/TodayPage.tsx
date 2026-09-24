import { useState } from "react";
import { PullLogTab } from "../pull-log/PullLogTab.tsx";
import { OverviewTab } from "./OverviewTab.tsx";
import { DailiesTab } from "./DailiesTab.tsx";
import { WeekliesTab } from "./WeekliesTab.tsx";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "dailies", label: "Dailies" },
  { key: "weeklies", label: "Weeklies" },
  { key: "pull-log", label: "Pull Log" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Mockup screens 01/12/13 (Overview/Dailies/Weeklies) share this same tab bar with screen 07 (Pull Log). */
export function TodayPage() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <h1 className="font-display font-bold text-lg">Today</h1>
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
        {tab === "overview" && <OverviewTab />}
        {tab === "dailies" && <DailiesTab />}
        {tab === "weeklies" && <WeekliesTab />}
        {tab === "pull-log" && <PullLogTab />}
      </div>
    </div>
  );
}
