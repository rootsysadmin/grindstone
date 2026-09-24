import { useMemo, useState } from "react";
import type { CalendarEntry } from "./calendarData.ts";
import { daysUntil, isLive } from "./calendarData.ts";
import { useSetEventProgress } from "../today/api.ts";
import { TaskProgressControl } from "../today/TaskProgressControl.tsx";

const KIND_COLOR: Record<string, string> = { banner: "bg-amber", event: "bg-blue", "battle-pass": "bg-pink" };

// Master data only carries dates, not clock times, so time-left is day-precision — no fabricated hour offset.
function timeLeftLabel(days: number): string {
  if (days < 0) return "ended";
  if (days === 0) return "today";
  return `${days}d`;
}

/**
 * Events with a real completion target (a stage count, or just "claimed"
 * for a reward with no stage count — see calendarData.ts's buildEventEntries)
 * get an editable control: TaskProgressControl already renders a checkbox
 * for target=1 or a +/- stepper for target>1, so a stage-cleared event and
 * a flat "claim the reward" event both fall out of the same component.
 * Banner/battle-pass progress and reward-less/stageCount-less events (no
 * real target — see calendarData.ts) stay a plain bar: pity/level are
 * derived, not something to set here, and an event with nothing to log is
 * shown as always-done rather than given a fake control.
 */
function ProgressCell({ e, onEventProgressChange }: { e: CalendarEntry; onEventProgressChange: (eventId: number, next: number) => void }) {
  const bar = (
    <div className="h-[5px] rounded bg-white/10">
      {e.progressFraction != null && (
        <div className={`h-full rounded ${e.progressFraction >= 1 ? "bg-green" : KIND_COLOR[e.kind] ?? "bg-white/40"}`} style={{ width: `${Math.min(100, e.progressFraction * 100)}%` }} />
      )}
    </div>
  );
  if (e.kind !== "event" || e.eventId == null || e.progressTarget == null) return bar;
  return (
    <div className="flex flex-col gap-1">
      {bar}
      <TaskProgressControl target={e.progressTarget} current={e.progressCurrent ?? 0} onChange={(next) => onEventProgressChange(e.eventId!, next)} />
    </div>
  );
}

function Row({ e, onEventProgressChange }: { e: CalendarEntry; onEventProgressChange: (eventId: number, next: number) => void }) {
  const days = e.endDate ? daysUntil(e.endDate) : null;
  return (
    <div className="grid items-center gap-2 px-2.5 py-1.5 border-b border-border2/60 last:border-0 text-xs" style={{ gridTemplateColumns: "20px 1fr 110px 90px 90px 150px 110px 110px" }}>
      <span className={`w-1.5 h-4 rounded-sm ${KIND_COLOR[e.kind] ?? "bg-white/20"}`} />
      <span className="truncate">
        {e.label}
        {e.subLabel ? ` · ${e.subLabel}` : ""}
      </span>
      <span className="font-mono text-[11px] text-text-dim capitalize">{e.category}</span>
      <span className="font-mono text-[11px] text-text-dim text-right">{e.startDate ?? "—"}</span>
      <span className="font-mono text-[11px] text-text-dim text-right">{e.endDate ?? "—"}</span>
      <ProgressCell e={e} onEventProgressChange={onEventProgressChange} />
      <span className="font-mono text-[11px] text-text-dim text-right truncate">{e.rewardLabel ?? "—"}</span>
      <span className="font-mono text-[11px] text-right">{days != null ? timeLeftLabel(days) : "—"}</span>
    </div>
  );
}

export function ListTab({ entries }: { entries: CalendarEntry[] }) {
  const setEventProgress = useSetEventProgress();
  const onEventProgressChange = (eventId: number, next: number) => setEventProgress.mutate({ eventId, current: next });

  const [unfinishedOnly, setUnfinishedOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  const trackable = entries.filter((e) => e.kind === "banner" || e.kind === "event" || e.kind === "battle-pass");
  const types = ["all", ...new Set(trackable.map((e) => e.category))];

  const filtered = trackable.filter((e) => {
    if (typeFilter !== "all" && e.category !== typeFilter) return false;
    if (unfinishedOnly && e.progressFraction != null && e.progressFraction >= 1) return false;
    return true;
  });

  const now = new Date();
  const endsThisWeek = filtered.filter((e) => isLive(e, now) && e.endDate && daysUntil(e.endDate) <= 7).sort((a, b) => daysUntil(a.endDate!) - daysUntil(b.endDate!));
  const liveRest = filtered.filter((e) => isLive(e, now) && e.endDate && daysUntil(e.endDate) > 7);
  const liveGroups = useMemo(() => {
    const byEnd = new Map<string, CalendarEntry[]>();
    for (const e of liveRest) byEnd.set(e.endDate!, [...(byEnd.get(e.endDate!) ?? []), e]);
    return [...byEnd.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [liveRest]);
  const upcoming = filtered
    .filter((e) => e.startDate && daysUntil(e.startDate) > 0)
    .sort((a, b) => daysUntil(a.startDate!) - daysUntil(b.startDate!));

  const unfinishedCount = trackable.filter((e) => isLive(e, now) && (e.progressFraction ?? 0) < 1).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono text-[11px] text-text-faint">{trackable.length} entries · sorted by what expires first</span>
        <div className="flex-1" />
        <button
          onClick={() => setUnfinishedOnly((v) => !v)}
          className={`font-mono text-[10px] px-2 py-1 rounded border ${unfinishedOnly ? "bg-pink/20 border-pink/50 text-pink" : "bg-white/5 border-white/10 text-text-dim"}`}
        >
          UNFINISHED · {unfinishedCount}
        </button>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-surface border border-white/10 rounded font-mono text-[10px] px-2 py-1 text-text-dim">
          {types.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "ALL TYPES" : t.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
       <div className="overflow-x-auto">
        <div className="min-w-[880px]">
        <div
          className="grid gap-2 px-2.5 py-1.5 border-b border-border2 font-mono text-[9px] tracking-wide text-text-faint"
          style={{ gridTemplateColumns: "20px 1fr 110px 90px 90px 150px 110px 110px" }}
        >
          <span />
          <span>ENTRY</span>
          <span>TYPE</span>
          <span className="text-right">STARTS</span>
          <span className="text-right">ENDS</span>
          <span>MY PROGRESS</span>
          <span className="text-right">REWARD</span>
          <span className="text-right">TIME LEFT</span>
        </div>

        {endsThisWeek.length > 0 && (
          <>
            <div className="px-2.5 py-1 bg-pink/5 font-mono text-[9px] tracking-widest text-pink">ENDS THIS WEEK</div>
            {endsThisWeek.map((e) => (
              <Row key={e.id} e={e} onEventProgressChange={onEventProgressChange} />
            ))}
          </>
        )}

        {liveGroups.map(([endDate, group]) => (
          <div key={endDate}>
            <div className="px-2.5 py-1 bg-white/[.02] font-mono text-[9px] tracking-widest text-amber">
              LIVE · ENDS {new Date(endDate).toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase()}
            </div>
            {group.map((e) => (
              <Row key={e.id} e={e} onEventProgressChange={onEventProgressChange} />
            ))}
          </div>
        ))}

        {upcoming.length > 0 && (
          <>
            <div className="px-2.5 py-1 bg-white/[.02] font-mono text-[9px] tracking-widest text-blue">UPCOMING</div>
            {upcoming.map((e) => (
              <Row key={e.id} e={e} onEventProgressChange={onEventProgressChange} />
            ))}
          </>
        )}

        {endsThisWeek.length === 0 && liveGroups.length === 0 && upcoming.length === 0 && <div className="p-3 text-xs text-text-faint">Nothing to show.</div>}
        </div>
       </div>
      </div>
    </div>
  );
}
