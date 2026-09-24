import { useState } from "react";
import type { ReactNode } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { TaskCadence, TaskRewardKind } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useCreateTask } from "./api.ts";

// See LogPullDialog.tsx's comment on why every <select> needs a solid background, not a translucent one.
const selectCls = "w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm";

/**
 * Screen 09's "new custom task" dialog, extended with a From-game toggle —
 * there's no sync connector yet (Stage 10), so this is also the only way
 * to add a "GAME DAILIES"/"WEEKLY CLEARS" row at all, not just a personal
 * "MY OWN TASKS" one. `defaultFromGame` just sets the initial toggle state
 * based on which section's "add" button opened it; the user can flip it.
 */
export function AddTaskDialog({
  defaultCadence,
  defaultFromGame = false,
  onClose,
}: {
  defaultCadence: TaskCadence;
  defaultFromGame?: boolean;
  onClose: () => void;
}) {
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const create = useCreateTask();

  const [cadence, setCadence] = useState<TaskCadence>(defaultCadence);
  const [fromGame, setFromGame] = useState(defaultFromGame);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState(1);
  const [forLabel, setForLabel] = useState("");
  const [rewardKind, setRewardKind] = useState<TaskRewardKind | "none">("none");
  const [rewardId, setRewardId] = useState<number | null>(null);
  const [rewardQuantity, setRewardQuantity] = useState(1);

  const rewardList = rewardKind === "currency" ? currencies : rewardKind === "material" ? materials : [];
  const canSubmit = label.trim().length > 0 && (rewardKind === "none" || rewardId != null);

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        cadence,
        label: label.trim(),
        target: Math.max(1, target),
        rewardKind: rewardKind === "none" ? null : rewardKind,
        rewardCurrencyId: rewardKind === "currency" ? rewardId : null,
        rewardMaterialId: rewardKind === "material" ? rewardId : null,
        rewardQuantity: rewardKind === "none" ? null : rewardQuantity,
        forLabel: forLabel.trim() || null,
        fromGame,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-[420px] max-w-full bg-panel border border-white/10 rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">New custom task</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Cadence">
            <div className="flex gap-1.5">
              {(["daily", "weekly", "once"] as TaskCadence[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                    cadence === c ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                  }`}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          <Field label="List">
            <div className="flex gap-1.5">
              <button
                onClick={() => setFromGame(true)}
                className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                  fromGame ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                }`}
              >
                FROM GAME
              </button>
              <button
                onClick={() => setFromGame(false)}
                className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                  !fromGame ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                }`}
              >
                MY OWN TASK
              </button>
            </div>
          </Field>

          <Field label="Task">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Photograph the Rails mural"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Target (for count tasks)">
              <input
                type="number"
                min={1}
                value={target}
                onChange={(e) => setTarget(Math.max(1, Number(e.target.value)))}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-center"
              />
            </Field>
            <Field label="For (optional)">
              <input
                value={forLabel}
                onChange={(e) => setForLabel(e.target.value)}
                placeholder="e.g. Zankou"
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Reward">
            <div className="flex gap-1.5 mb-2">
              {(["none", "currency", "material"] as (TaskRewardKind | "none")[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setRewardKind(k);
                    setRewardId(null);
                  }}
                  className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                    rewardKind === k ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                  }`}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
            {rewardKind !== "none" && (
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <select value={rewardId ?? ""} onChange={(e) => setRewardId(Number(e.target.value))} className={selectCls}>
                  <option value="" disabled>
                    Select…
                  </option>
                  {rewardList.map((row) => (
                    <option key={row.id} value={row.id as number}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={rewardQuantity}
                  onChange={(e) => setRewardQuantity(Math.max(1, Number(e.target.value)))}
                  placeholder="qty"
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
                />
              </div>
            )}
          </Field>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2">
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CANCEL
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || create.isPending}
            className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40"
          >
            + TASK
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">{label}</div>
      {children}
    </div>
  );
}
