import { useMemo, useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useBattlePassProgress, useEventProgress, useEventRewards, useTaskProgress, useTasks } from "../today/api.ts";
import { useIncomeClaims, useIncomeSources } from "../planner/api.ts";
import { usePityState } from "../pull-log/api.ts";
import { battlePassEntry, buildBannerEntries, buildEventEntries, incomeEntries, weeklyResetEntries, type CalendarEntry } from "./calendarData.ts";
import { TimelineTab } from "./TimelineTab.tsx";
import { ListTab } from "./ListTab.tsx";
import { MonthGridTab } from "./MonthGridTab.tsx";

const TABS = [
  { key: "timeline", label: "Timeline" },
  { key: "list", label: "List" },
  { key: "month", label: "Month grid" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Mockup screens 04/20/21 — three renderers over one shared CalendarEntry[] data layer (calendarData.ts). */
export function CalendarPage() {
  const [tab, setTab] = useState<TabKey>("timeline");

  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: eventRows = [] } = useEntityList(entityConfigs.events);
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: materialRows = [] } = useEntityList(entityConfigs.materials);
  const { data: eventProgressRows = [] } = useEventProgress();
  const { data: eventRewardRows = [] } = useEventRewards();
  const { data: pools = [] } = usePityState();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const { data: battlePass } = useBattlePassProgress();
  const { data: tasks = [] } = useTasks();
  const { data: taskProgress = [] } = useTaskProgress();

  const characterById = useMemo(() => new Map(characterRows.map((c) => [c.id, c])), [characterRows]);
  const equipmentById = useMemo(() => new Map(equipmentRows.map((e) => [e.id, e])), [equipmentRows]);
  const currencyById = useMemo(() => new Map(currencyRows.map((c) => [c.id, c])), [currencyRows]);
  const materialById = useMemo(() => new Map(materialRows.map((m) => [m.id, m])), [materialRows]);
  const pullCurrency = useMemo(() => currencyRows.find((c) => (c.pullCost as number | null) != null), [currencyRows]);

  // 6 months of range is generous headroom for both the 42-day timeline and month-grid navigation without recomputing per-tab.
  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    return { start, end };
  }, []);

  const entries = useMemo<CalendarEntry[]>(() => {
    const bp = battlePassEntry(battlePass);
    return [
      ...buildBannerEntries(bannerRows, characterById, equipmentById, pools),
      ...buildEventEntries(eventRows, eventProgressRows, eventRewardRows, currencyById, materialById),
      ...weeklyResetEntries(range.start, range.end),
      ...incomeEntries(incomeSources, claims, range.start, range.end),
      ...(bp ? [bp] : []),
    ];
  }, [bannerRows, eventRows, characterById, equipmentById, currencyById, materialById, pools, eventProgressRows, eventRewardRows, incomeSources, claims, battlePass, range]);

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <h1 className="font-display font-bold text-lg">Calendar</h1>
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
        {tab === "timeline" && <TimelineTab entries={entries} />}
        {tab === "list" && <ListTab entries={entries} />}
        {tab === "month" && (
          <MonthGridTab entries={entries} incomeSources={incomeSources} claims={claims} pullCurrency={pullCurrency} tasks={tasks} taskProgress={taskProgress} />
        )}
      </div>
    </div>
  );
}
