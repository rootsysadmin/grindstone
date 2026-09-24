import type { TaskCadence, TaskProgressRow, TaskRow } from "@grindstone/shared";

/**
 * Pure client-side derivation over tasks + task_progress — same
 * architecture as pull-log/pityView.ts. periodKey is computed from
 * wall-clock time at read time, so there's no reset cron: a task_progress
 * row just stops being "current" once the date rolls past its periodKey.
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date, not UTC — matches how a player thinks about "today." */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 8601 week ("YYYY-Www"), Monday-start, week 1 = the week containing the year's first Thursday. */
export function isoWeekKey(d: Date): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - dayNum + 3); // Thursday of this ISO week
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getFullYear()}-W${pad(week)}`;
}

export function currentPeriodKey(cadence: TaskCadence, now: Date = new Date()): string {
  if (cadence === "weekly") return isoWeekKey(now);
  if (cadence === "once") return "once";
  return dateKey(now);
}

export function progressFor(taskId: number, periodKey: string, progress: TaskProgressRow[]): number {
  return progress.find((p) => p.taskId === taskId && p.periodKey === periodKey)?.current ?? 0;
}

export function isDone(task: TaskRow, current: number): boolean {
  return current >= task.target;
}

/** Consecutive completed days walking backward from today (or yesterday, if today isn't done yet — an in-progress day shouldn't zero out an otherwise-intact streak). Daily tasks only. */
export function computeStreak(task: TaskRow, progress: TaskProgressRow[], now: Date = new Date()): number {
  if (task.cadence !== "daily") return 0;
  const byKey = new Map(progress.filter((p) => p.taskId === task.id).map((p) => [p.periodKey, p.current]));
  let streak = 0;
  const d = new Date(now);
  if ((byKey.get(dateKey(d)) ?? 0) < task.target) d.setDate(d.getDate() - 1);
  for (;;) {
    const val = byKey.get(dateKey(d)) ?? 0;
    if (val < task.target) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export interface DayStatus {
  periodKey: string;
  status: "full" | "partial" | "missed";
}

/** Per-day completion over the last `days` days (oldest first), scored against every daily task — no points involved. */
export function dailyHistory(tasks: TaskRow[], progress: TaskProgressRow[], days = 14, now: Date = new Date()): DayStatus[] {
  const dailyTasks = tasks.filter((t) => t.cadence === "daily");
  const result: DayStatus[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (dailyTasks.length === 0) {
      result.push({ periodKey: key, status: "missed" });
      continue;
    }
    let doneCount = 0;
    let anyProgress = false;
    for (const t of dailyTasks) {
      const cur = progressFor(t.id, key, progress);
      if (cur > 0) anyProgress = true;
      if (cur >= t.target) doneCount++;
    }
    result.push({ periodKey: key, status: doneCount === dailyTasks.length ? "full" : anyProgress ? "partial" : "missed" });
  }
  return result;
}

export interface WeekStat {
  periodKey: string;
  fraction: number;
}

/** Per-week completion fraction (average of each weekly task's current/target, capped at 1) over the last `weeks` weeks (oldest first). */
export function weekOverWeek(tasks: TaskRow[], progress: TaskProgressRow[], weeks = 5, now: Date = new Date()): WeekStat[] {
  const weeklyTasks = tasks.filter((t) => t.cadence === "weekly");
  const result: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = isoWeekKey(d);
    if (weeklyTasks.length === 0) {
      result.push({ periodKey: key, fraction: 0 });
      continue;
    }
    const sum = weeklyTasks.reduce((a, t) => a + Math.min(1, progressFor(t.id, key, progress) / t.target), 0);
    result.push({ periodKey: key, fraction: sum / weeklyTasks.length });
  }
  return result;
}
