import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { TaskRow } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useDeleteTask, useTasks, useTaskProgress, useUpdateTaskProgress } from "./api.ts";
import { AddTaskDialog } from "./AddTaskDialog.tsx";
import { TaskProgressControl } from "./TaskProgressControl.tsx";
import { currentPeriodKey, dailyHistory, computeStreak, isDone, progressFor } from "./taskStats.ts";

export function DailiesTab() {
  const { data: tasks = [] } = useTasks();
  const { data: progress = [] } = useTaskProgress();
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const updateProgress = useUpdateTaskProgress();
  const deleteTask = useDeleteTask();
  const [addDialog, setAddDialog] = useState<"none" | "game" | "own">("none");

  const gameDailies = tasks.filter((t) => t.cadence === "daily" && t.fromGame);
  const myTasks = tasks.filter((t) => !t.fromGame && t.cadence !== "weekly");
  const periodFor = (t: TaskRow) => currentPeriodKey(t.cadence);

  const rewardLabel = (t: TaskRow) => {
    if (!t.rewardKind) return null;
    const list = t.rewardKind === "currency" ? currencies : materials;
    const id = t.rewardKind === "currency" ? t.rewardCurrencyId : t.rewardMaterialId;
    const name = list.find((r) => r.id === id)?.name ?? "?";
    return `→ ${t.rewardQuantity ?? 1} ${name}`;
  };

  const history = dailyHistory(tasks, progress, 14);
  const gameDone = gameDailies.filter((t) => isDone(t, progressFor(t.id, periodFor(t), progress))).length;

  function setCurrent(t: TaskRow, next: number) {
    updateProgress.mutate({ id: t.id, periodKey: periodFor(t), current: next });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Game Dailies</span>
            <span className="font-mono text-[10px] text-text-faint">
              {gameDone} / {gameDailies.length} done
            </span>
          </div>
          <div className="flex flex-col">
            {gameDailies.length === 0 && <div className="p-3 text-xs text-text-faint">No game dailies added yet.</div>}
            <div className="overflow-x-auto">
             <div className="min-w-[420px]">
            {gameDailies.map((t) => {
              const current = progressFor(t.id, periodFor(t), progress);
              const streak = computeStreak(t, progress);
              return (
                <div key={t.id} className="grid grid-cols-[20px_1fr_140px_60px_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <TaskProgressControl target={t.target} current={current} onChange={(n) => setCurrent(t, n)} />
                  <span className={isDone(t, current) ? "text-text-faint line-through" : ""}>{t.label}</span>
                  <span className="font-mono text-[10px] text-text-faint truncate">{rewardLabel(t)}</span>
                  <span className={`font-mono text-[10px] text-right ${streak > 0 ? "text-green" : "text-text-faint"}`}>
                    {streak > 0 ? `${streak}d` : "—"}
                  </span>
                  <button onClick={() => deleteTask.mutate(t.id)} className="text-pink/60 hover:text-pink font-mono text-[11px]">
                    ✕
                  </button>
                </div>
              );
            })}
             </div>
            </div>
            <button
              onClick={() => setAddDialog("game")}
              className="text-left px-3 py-1.5 text-[11px] font-mono text-text-faint border border-dashed border-white/10 m-2 rounded"
            >
              + add a game daily…
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">My Own Tasks</span>
            <span className="font-mono text-[10px] text-text-faint">not from the game</span>
          </div>
          <div className="flex flex-col">
            {myTasks.length === 0 && <div className="p-3 text-xs text-text-faint">No custom tasks yet.</div>}
            <div className="overflow-x-auto">
             <div className="min-w-[420px]">
            {myTasks.map((t) => {
              const current = progressFor(t.id, periodFor(t), progress);
              return (
                <div key={t.id} className="grid grid-cols-[20px_1fr_140px_60px_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <TaskProgressControl target={t.target} current={current} onChange={(n) => setCurrent(t, n)} />
                  <span className={isDone(t, current) ? "text-text-faint line-through" : ""}>
                    {t.label}
                    {t.forLabel && <span className="text-text-faint"> · {t.forLabel}</span>}
                  </span>
                  <span className="font-mono text-[10px] text-text-faint truncate">{rewardLabel(t)}</span>
                  <span className="font-mono text-[10px] text-text-faint text-right">{t.cadence}</span>
                  <button onClick={() => deleteTask.mutate(t.id)} className="text-pink/60 hover:text-pink font-mono text-[11px]">
                    ✕
                  </button>
                </div>
              );
            })}
             </div>
            </div>
            <button
              onClick={() => setAddDialog("own")}
              className="text-left px-3 py-1.5 text-[11px] font-mono text-text-faint border border-dashed border-white/10 m-2 rounded"
            >
              + add a task…
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Today</div>
          <div className="p-2.5 font-mono text-xs text-text-dim">
            {gameDone + myTasks.filter((t) => isDone(t, progressFor(t.id, periodFor(t), progress))).length} /{" "}
            {gameDailies.length + myTasks.length} done
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Last 14 Days</div>
          <div className="p-2.5">
            <div className="grid grid-cols-7 gap-1">
              {history.map((h) => (
                <span
                  key={h.periodKey}
                  title={h.periodKey}
                  className={`h-[22px] rounded-[3px] ${
                    h.status === "full" ? "bg-green" : h.status === "partial" ? "bg-amber/50" : "bg-white/[.06]"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-3 mt-2 font-mono text-[10px] text-text-faint">
              <span>{history.filter((h) => h.status === "full").length} full</span>
              <span className="text-amber/80">{history.filter((h) => h.status === "partial").length} partial</span>
              <span className="text-pink/80">{history.filter((h) => h.status === "missed").length} missed</span>
            </div>
          </div>
        </div>
      </div>

      {addDialog !== "none" && (
        <AddTaskDialog defaultCadence="daily" defaultFromGame={addDialog === "game"} onClose={() => setAddDialog("none")} />
      )}
    </div>
  );
}
