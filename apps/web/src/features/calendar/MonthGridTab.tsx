import { useMemo, useState } from "react";
import type { IncomeClaimRow, IncomeSourceRow, MasterDataRow, TaskProgressRow, TaskRow } from "@grindstone/shared";
import { currentPeriodKey, isDone } from "../today/taskStats.ts";
import { findPivot, monthTotals, type CalendarEntry } from "./calendarData.ts";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

interface DayChip {
  label: string;
  color: string;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function chipsForDay(entries: CalendarEntry[], key: string): DayChip[] {
  const chips: DayChip[] = [];
  for (const e of entries) {
    if (e.startDate === key && (e.kind === "banner" || e.kind === "event")) chips.push({ label: `${e.label} opens`, color: e.kind === "banner" ? "amber" : "blue" });
    if (e.endDate === key && (e.kind === "banner" || e.kind === "event")) chips.push({ label: `${e.label} ends`, color: e.kind === "banner" ? "amber" : "blue" });
    if (e.kind === "weekly-reset" && e.startDate === key) chips.push({ label: "weekly reset", color: "pink" });
    if (e.kind === "battle-pass" && e.endDate === key) chips.push({ label: "battle pass ends", color: "pink" });
    if (e.kind === "income" && e.startDate === key) chips.push({ label: e.label, color: "green" });
  }
  return chips;
}

const CHIP_CLASS: Record<string, string> = {
  amber: "bg-amber/15 border-l-2 border-amber text-[#f7d69b]",
  blue: "bg-blue/15 border-l-2 border-blue text-[#a7d9f7]",
  pink: "bg-pink/15 border-l-2 border-pink text-[#f0a3c3]",
  green: "bg-green/15 border-l-2 border-green text-[#9fe3bd]",
};

export function MonthGridTab({
  entries,
  incomeSources,
  claims,
  pullCurrency,
  tasks,
  taskProgress,
}: {
  entries: CalendarEntry[];
  incomeSources: IncomeSourceRow[];
  claims: IncomeClaimRow[];
  pullCurrency: MasterDataRow | undefined;
  tasks: TaskRow[];
  taskProgress: TaskProgressRow[];
}) {
  const now = new Date();
  const [viewed, setViewed] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const monthStart = viewed;
  const monthEnd = new Date(viewed.getFullYear(), viewed.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayKey = dateKey(now);
  const dailyTasks = tasks.filter((t) => t.cadence === "daily" && t.fromGame);
  const dailyDone = dailyTasks.filter((t) => isDone(t, taskProgress.find((p) => p.taskId === t.id && p.periodKey === currentPeriodKey("daily", now))?.current ?? 0)).length;
  const dailiesLeft = dailyTasks.length - dailyDone;

  const pivot = useMemo(() => findPivot(entries, now), [entries]);
  const totals = useMemo(() => monthTotals(entries, incomeSources, claims, pullCurrency, monthStart, monthEnd), [entries, incomeSources, claims, pullCurrency, monthStart, monthEnd]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px] gap-3">
      <div className="border border-border2 rounded-lg overflow-hidden bg-surface">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border2">
          <button onClick={() => setViewed(new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1))} className="text-text-faint hover:text-text px-1">
            ←
          </button>
          <span className="font-mono text-xs">{viewed.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <button onClick={() => setViewed(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 1))} className="text-text-faint hover:text-text px-1">
            →
          </button>
          <div className="flex-1" />
          <div className="flex gap-2.5 font-mono text-[10px] text-text-dim">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-amber" />
              banner
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-blue" />
              event
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-pink" />
              deadline
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-green" />
              income
            </span>
          </div>
        </div>

        <div className="grid grid-cols-7 bg-surface2 border-b border-border2">
          {WEEKDAYS.map((w) => (
            <span key={w} className="px-2 py-1.5 font-mono text-[9px] tracking-wide text-text-faint">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-white/5">
          {cells.map((d) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === viewed.getMonth();
            const isToday = key === todayKey;
            const chips = chipsForDay(entries, key);
            const shown = chips.slice(0, 2);
            const overflow = chips.length - shown.length;
            return (
              <div
                key={key}
                className={`min-h-[88px] p-1.5 flex flex-col gap-1 ${inMonth ? "bg-surface" : "bg-surface2 opacity-40"} ${isToday ? "bg-pink/[.08] shadow-[inset_0_0_0_1px_#e8639b]" : ""}`}
              >
                <span className={`font-mono text-[11px] ${isToday ? "text-pink font-semibold" : inMonth ? "text-text-dim" : "text-text-faint"}`}>
                  {isToday ? `${d.getDate()} · TODAY` : d.getDate()}
                </span>
                {shown.map((c, i) => (
                  <span key={i} className={`font-mono text-[9px] px-1 py-0.5 rounded-sm truncate ${CHIP_CLASS[c.color]}`}>
                    {c.label}
                  </span>
                ))}
                {overflow > 0 && <span className="font-mono text-[9px] px-1 py-0.5 rounded-sm bg-purple/15 border-l-2 border-purple text-[#c7b6fa]">+{overflow} more</span>}
                {isToday && dailiesLeft > 0 && (
                  <span className="font-mono text-[9px] px-1 py-0.5 rounded-sm bg-pink/15 border-l-2 border-pink text-[#f0a3c3]">{dailiesLeft} dailies left</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {pivot && (
          <div className="bg-surface border border-amber/30 rounded-lg overflow-hidden">
            <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-amber">
              {new Date(pivot.date).toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase()} · THE PIVOT
            </div>
            <div className="flex flex-col text-xs">
              {pivot.ending.map((e) => (
                <div key={`end-${e.id}`} className="flex gap-2 px-2.5 py-1.5 border-b border-border2/60">
                  <span className="w-1 rounded" style={{ background: e.kind === "event" ? "#58b7f0" : "#f0b44a" }} />
                  <span className="flex-1">{e.label} ends</span>
                </div>
              ))}
              {pivot.starting.map((e) => (
                <div key={`start-${e.id}`} className="flex gap-2 px-2.5 py-1.5 border-b border-border2/60 last:border-0">
                  <span className="w-1 rounded bg-green" />
                  <span className="flex-1">{e.label} opens</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">MONTH TOTALS</div>
          <div className="p-2.5 grid grid-cols-2 gap-2.5">
            <div>
              <div className="font-mono text-[9px] text-text-faint">CURRENCY IN</div>
              <div className="font-display font-bold text-lg text-amber">{Math.round(totals.annulithIn).toLocaleString()}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">PULLS</div>
              <div className="font-display font-bold text-lg">{totals.pulls ?? "—"}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">DEADLINES</div>
              <div className="font-display font-bold text-lg text-pink">{totals.deadlines}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">RESETS</div>
              <div className="font-display font-bold text-lg">{totals.resets}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
