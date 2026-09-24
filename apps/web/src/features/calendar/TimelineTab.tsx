import type { CalendarEntry } from "./calendarData.ts";
import { daysUntil, findPivot } from "./calendarData.ts";

const CATEGORY_COLORS = ["amber", "purple", "blue", "green"] as const;
const COLOR_HEX: Record<(typeof CATEGORY_COLORS)[number], string> = {
  amber: "#f0b44a",
  purple: "#a084f5",
  blue: "#58b7f0",
  green: "#5fd08a",
};

function colorForCategory(category: string, categories: string[]): (typeof CATEGORY_COLORS)[number] {
  const idx = categories.indexOf(category) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx]!;
}

function windowStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dayNum);
  return d;
}

function dayOffset(dateStr: string, start: Date): number {
  return Math.round((new Date(dateStr).getTime() - start.getTime()) / 86400000);
}

function formatDayHeader(d: Date): string {
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" }).toUpperCase()}`;
}

function Bar({ entry, color, days }: { entry: CalendarEntry; color: string; days: number }) {
  if (!entry.startDate || !entry.endDate) return null;
  const start = Math.max(0, dayOffset(entry.startDate!, windowStart(new Date())));
  const end = Math.min(days, dayOffset(entry.endDate!, windowStart(new Date())) + 1);
  if (end <= 0 || start >= days) return null;
  const bg = entry.isRerun
    ? `repeating-linear-gradient(45deg, ${color}38 0 4px, ${color}14 4px 8px)`
    : `linear-gradient(90deg, ${color}59, ${color}2e)`;
  return (
    <div
      className="h-5 rounded flex items-center px-1.5 font-mono text-[10px] overflow-hidden whitespace-nowrap"
      style={{ gridColumn: `${start + 1} / ${end + 1}`, background: bg, border: `1px solid ${color}80`, color }}
      title={`${entry.label}${entry.subLabel ? " · " + entry.subLabel : ""}`}
    >
      {entry.label}
      {entry.subLabel ? ` · ${entry.subLabel}` : ""}
    </div>
  );
}

export function TimelineTab({ entries }: { entries: CalendarEntry[] }) {
  const now = new Date();
  const start = windowStart(now);
  const days = 42;
  const headers = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    return formatDayHeader(d);
  });
  const todayOffset = dayOffset(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, start);

  const banners = entries.filter((e) => e.kind === "banner");
  const events = entries.filter((e) => e.kind === "event");
  const categories = [...new Set(banners.map((b) => b.category))];

  const deadlines = entries
    .filter((e) => (e.kind === "banner" || e.kind === "event") && e.endDate && daysUntil(e.endDate) >= 0)
    .sort((a, b) => daysUntil(a.endDate!) - daysUntil(b.endDate!))
    .slice(0, 6);

  const pivot = findPivot(entries, now);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_296px] gap-3">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
       <div className="overflow-x-auto">
        <div className="min-w-[820px]">
        <div className="grid" style={{ gridTemplateColumns: "186px 1fr" }}>
          <div className="px-2.5 py-1.5 font-mono text-[9px] tracking-wide text-text-faint border-r border-border2 border-b border-border2">TRACK</div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
            {headers.map((h) => (
              <div key={h} className="px-1.5 py-1.5 font-mono text-[9px] text-text-faint border-l border-border2/60 border-b border-border2">
                {h}
              </div>
            ))}
          </div>
        </div>

        {categories.length === 0 && events.length === 0 && (
          <div className="px-2.5 py-4 text-xs text-text-faint">Nothing scheduled yet.</div>
        )}

        {categories.map((category) => {
          const color = COLOR_HEX[colorForCategory(category, categories)];
          return (
            <div key={category}>
              <div className="px-2.5 py-1 bg-white/[.02] border-b border-border2 font-mono text-[9px] tracking-widest" style={{ color }}>
                {category.toUpperCase()} BANNERS
              </div>
              {banners
                .filter((b) => b.category === category)
                .map((b) => (
                  <div key={b.id} className="grid border-b border-border2/60" style={{ gridTemplateColumns: "186px 1fr" }}>
                    <div className="px-2.5 py-1.5 text-xs border-r border-border2 flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: color }} />
                      {b.label}
                    </div>
                    <div className="grid py-1" style={{ gridTemplateColumns: `repeat(${days},1fr)` }}>
                      <Bar entry={b} color={color} days={days} />
                    </div>
                  </div>
                ))}
            </div>
          );
        })}

        <div className="px-2.5 py-1 bg-white/[.02] border-b border-t border-border2 font-mono text-[9px] tracking-widest text-blue">EVENTS · {events.length}</div>
        {events.map((e) => (
          <div key={e.id} className="grid border-b border-border2/60" style={{ gridTemplateColumns: "186px 1fr" }}>
            <div className="px-2.5 py-1 text-xs border-r border-border2 truncate">{e.label}</div>
            <div className="grid py-1" style={{ gridTemplateColumns: `repeat(${days},1fr)` }}>
              <Bar entry={e} color={COLOR_HEX.blue} days={days} />
            </div>
          </div>
        ))}

        <div className="grid bg-pink/5" style={{ gridTemplateColumns: "186px 1fr" }}>
          <div className="px-2.5 py-1.5 font-mono text-[10px] text-pink border-r border-border2">
            TODAY · {now.getDate()} {now.toLocaleString("en-US", { month: "short" }).toUpperCase()}
          </div>
          <div className="grid items-center" style={{ gridTemplateColumns: `repeat(${days},1fr)` }}>
            {todayOffset >= 0 && todayOffset < days && <div className="h-full bg-pink" style={{ gridColumn: `${todayOffset + 1} / ${todayOffset + 2}` }} />}
          </div>
        </div>
        </div>
       </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-pink/25 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-pink">MY DEADLINES</div>
          <div className="flex flex-col">
            {deadlines.length === 0 && <div className="p-3 text-xs text-text-faint">Nothing ending soon.</div>}
            {deadlines.map((d) => {
              const days2 = daysUntil(d.endDate!);
              return (
                <div key={d.id} className="flex gap-2 items-center px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <span className="font-mono text-[11px] text-pink w-12 flex-none">{days2}d</span>
                  <span className="flex-1 truncate">
                    {d.label}
                    {d.subLabel ? ` · ${d.subLabel}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {pivot && (
          <div className="bg-surface border border-amber/30 rounded-lg overflow-hidden">
            <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-amber">
              {new Date(pivot.date).toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase()} · THE PIVOT
            </div>
            <div className="flex flex-col text-xs">
              {pivot.ending.map((e) => (
                <div key={`end-${e.id}`} className="flex gap-2 px-2.5 py-1.5 border-b border-border2/60">
                  <span className="w-1 rounded" style={{ background: e.kind === "event" ? COLOR_HEX.blue : COLOR_HEX.amber }} />
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
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">LEGEND</div>
          <div className="p-2.5 grid grid-cols-2 gap-1.5 font-mono text-[10px] text-text-dim">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-2 rounded-sm bg-amber/35 border border-amber/50" />
              solid = new
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-2 rounded-sm border border-white/20"
                style={{ background: "repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 3px, transparent 3px 6px)" }}
              />
              striped = rerun
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-0.5 h-2.5 bg-pink" />
              today
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
