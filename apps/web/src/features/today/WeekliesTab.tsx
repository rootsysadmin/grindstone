import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { TaskRow } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useClaimIncomeSource, useIncomeClaims, useIncomeSources } from "../planner/api.ts";
import { isClaimedThisPeriod } from "../planner/materialNeeds.ts";
import { useBattlePassProgress, useDeleteTask, useSetBattlePassProgress, useTasks, useTaskProgress, useUpdateTaskProgress } from "./api.ts";
import { AddTaskDialog } from "./AddTaskDialog.tsx";
import { TaskProgressControl } from "./TaskProgressControl.tsx";
import { currentPeriodKey, isDone, progressFor, weekOverWeek } from "./taskStats.ts";

export function WeekliesTab() {
  const { data: tasks = [] } = useTasks();
  const { data: progress = [] } = useTaskProgress();
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const { data: battlePass } = useBattlePassProgress();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const updateProgress = useUpdateTaskProgress();
  const deleteTask = useDeleteTask();
  const setBattlePass = useSetBattlePassProgress();
  const claimSource = useClaimIncomeSource();
  const [showAdd, setShowAdd] = useState(false);

  const weeklyTasks = tasks.filter((t) => t.cadence === "weekly");
  const periodKey = currentPeriodKey("weekly");
  const monthlySources = incomeSources.filter((s) => s.cadence === "monthly");
  const weeks = weekOverWeek(tasks, progress, 5);
  const doneCount = weeklyTasks.filter((t) => isDone(t, progressFor(t.id, periodKey, progress))).length;

  const rewardLabel = (t: TaskRow) => {
    if (!t.rewardKind) return null;
    const list = t.rewardKind === "currency" ? currencies : materials;
    const id = t.rewardKind === "currency" ? t.rewardCurrencyId : t.rewardMaterialId;
    const name = list.find((r) => r.id === id)?.name ?? "?";
    return `→ ${t.rewardQuantity ?? 1} ${name}`;
  };

  function setCurrent(t: TaskRow, next: number) {
    updateProgress.mutate({ id: t.id, periodKey, current: next });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Weekly Clears</span>
            <span className="font-mono text-[10px] text-text-faint">
              {doneCount} / {weeklyTasks.length} complete
            </span>
          </div>
          <div className="flex flex-col">
            {weeklyTasks.length === 0 && <div className="p-3 text-xs text-text-faint">No weekly tasks added yet.</div>}
            <div className="overflow-x-auto">
             <div className="min-w-[460px]">
            {weeklyTasks.map((t) => {
              const current = progressFor(t.id, periodKey, progress);
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_130px_150px_100px_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs"
                >
                  <span>
                    {t.label}
                    {t.forLabel && <span className="text-text-faint"> · {t.forLabel}</span>}
                  </span>
                  <TaskProgressControl target={t.target} current={current} onChange={(n) => setCurrent(t, n)} />
                  <div className="h-[5px] rounded bg-white/10">
                    <div
                      className={`h-full rounded ${isDone(t, current) ? "bg-green" : "bg-purple"}`}
                      style={{ width: `${Math.min(100, (current / t.target) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-faint truncate">{rewardLabel(t)}</span>
                  <button onClick={() => deleteTask.mutate(t.id)} className="text-pink/60 hover:text-pink font-mono text-[11px]">
                    ✕
                  </button>
                </div>
              );
            })}
             </div>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="text-left px-3 py-1.5 text-[11px] font-mono text-text-faint border border-dashed border-white/10 m-2 rounded"
            >
              + add a weekly task…
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Monthly</div>
          <div className="p-2.5 flex flex-col gap-3">
            {battlePass && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Battle pass level</span>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <input
                      key={battlePass.currentLevel}
                      type="number"
                      min={0}
                      defaultValue={battlePass.currentLevel}
                      onBlur={(e) =>
                        setBattlePass.mutate({
                          currentLevel: Math.max(0, Number(e.target.value)),
                          maxLevel: battlePass.maxLevel,
                          endDate: battlePass.endDate,
                        })
                      }
                      className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-right"
                    />
                    <span className="text-text-faint">/ {battlePass.maxLevel}</span>
                  </div>
                </div>
                <div className="h-[5px] rounded bg-white/10">
                  <div
                    className="h-full rounded bg-amber"
                    style={{ width: `${Math.min(100, (battlePass.currentLevel / battlePass.maxLevel) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {monthlySources.length === 0 && (
              <div className="text-[11px] text-text-faint">No monthly income sources yet — add one on the Planner's Income tab.</div>
            )}
            {monthlySources.map((s) => {
              const claimed = isClaimedThisPeriod(s, claims);
              return (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span>{s.name}</span>
                  <button
                    onClick={() => claimSource.mutate(s.id)}
                    disabled={claimed}
                    className={`text-[9px] font-mono px-1.5 py-1 rounded ${
                      claimed ? "bg-white/5 text-text-faint" : "bg-amber/15 border border-amber/40 text-amber hover:bg-amber/25"
                    }`}
                  >
                    {claimed ? "CLAIMED" : "CLAIM"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Week Over Week</div>
          <div className="p-2.5 flex items-stretch gap-1.5 h-[70px]">
            {weeks.map((w) => (
              <div key={w.periodKey} title={w.periodKey} className="flex-1 h-full flex flex-col justify-end">
                <div className="rounded-t bg-blue/60" style={{ height: `${Math.max(3, w.fraction * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="px-2.5 pb-2.5 font-mono text-[10px] text-text-faint">completion rate · last {weeks.length} weeks</div>
        </div>
      </div>

      {showAdd && <AddTaskDialog defaultCadence="weekly" onClose={() => setShowAdd(false)} />}
    </div>
  );
}
