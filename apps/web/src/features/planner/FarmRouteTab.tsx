import { useState } from "react";
import type { FarmRouteEntryRow } from "@grindstone/shared";
import {
  useCreateFarmRouteEntry,
  useDeleteFarmRouteEntry,
  useFarmRoute,
  useReorderFarmRoute,
  useUpdateFarmRouteEntry,
} from "./api.ts";

/** A manual, personal to-do list — no stamina, no drop rates, no auto-solve (farming plans are too personal to auto-solve, and stamina isn't meaningfully tied to specific stages — see docs/progress.md's Stage 3 entry). Reorder via native HTML5 drag-and-drop, no extra dependency. */
export function FarmRouteTab() {
  const { data: entries = [] } = useFarmRoute();
  const createRow = useCreateFarmRouteEntry();
  const updateRow = useUpdateFarmRouteEntry();
  const deleteRow = useDeleteFarmRouteEntry();
  const reorder = useReorderFarmRoute();
  const [dragId, setDragId] = useState<number | null>(null);

  const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder);
  const plannedTotal = sorted.reduce((a, e) => a + (e.done ? 0 : e.plannedRuns), 0);
  const doneCount = sorted.filter((e) => e.done).length;

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const ids = sorted.map((e) => e.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
    setDragId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Today's route · drag to reorder</span>
          <span className="font-mono text-[10px] text-text-faint">{plannedTotal} runs planned · {doneCount} done</span>
        </div>
        <div className="overflow-x-auto">
         <div className="min-w-[520px]">
        <div className="grid grid-cols-[20px_1fr_1fr_70px_1fr_24px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
          <span></span>
          <span>Stage</span>
          <span>Target</span>
          <span className="text-right">Runs</span>
          <span>For</span>
          <span></span>
        </div>
        <div className="flex flex-col">
          {sorted.length === 0 && <div className="p-3 text-xs text-text-faint">No entries yet — add a stage below.</div>}
          {sorted.map((entry) => (
            <RouteRow
              key={entry.id}
              entry={entry}
              dragging={dragId === entry.id}
              onDragStart={() => setDragId(entry.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(entry.id)}
              onUpdate={(body) => updateRow.mutate({ id: entry.id, body })}
              onDelete={() => deleteRow.mutate(entry.id)}
            />
          ))}
        </div>
         </div>
        </div>
        <div className="p-2 border-t border-border2">
          <button
            onClick={() => createRow.mutate({ label: "New stage", plannedRuns: 1, sortOrder: sorted.length })}
            className="text-amber font-mono text-[11px]"
          >
            + add a stage manually
          </button>
        </div>
        {doneCount > 0 && (
          <div className="px-3 py-2 border-t border-border2">
            <button
              onClick={() => sorted.filter((e) => e.done).forEach((e) => deleteRow.mutate(e.id))}
              className="text-[10px] font-mono text-text-dim hover:text-text"
            >
              CLEAR DONE ({doneCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RouteRow({
  entry,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onUpdate,
  onDelete,
}: {
  entry: FarmRouteEntryRow;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onUpdate: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`grid grid-cols-[20px_1fr_1fr_70px_1fr_24px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs ${dragging ? "opacity-40" : ""} ${entry.done ? "opacity-50" : ""}`}
    >
      <span className="font-mono text-text-faint cursor-grab select-none">⋮⋮</span>
      <input
        defaultValue={entry.label}
        className={`bg-surface border border-white/10 rounded px-1.5 py-1 ${entry.done ? "line-through" : ""}`}
        onBlur={(e) => onUpdate({ label: e.target.value })}
      />
      <input
        defaultValue={entry.targetLabel ?? ""}
        placeholder="what it's for"
        className="bg-surface border border-white/10 rounded px-1.5 py-1"
        onBlur={(e) => onUpdate({ targetLabel: e.target.value || null })}
      />
      <input
        type="number"
        min={0}
        defaultValue={entry.plannedRuns}
        className="bg-surface border border-white/10 rounded px-1.5 py-1 text-right font-mono"
        onBlur={(e) => onUpdate({ plannedRuns: Math.max(0, Number(e.target.value)) })}
      />
      <input
        defaultValue={entry.forLabel ?? ""}
        placeholder="who it's for"
        className="bg-surface border border-white/10 rounded px-1.5 py-1"
        onBlur={(e) => onUpdate({ forLabel: e.target.value || null })}
      />
      <div className="flex items-center gap-1.5">
        <button onClick={() => onUpdate({ done: !entry.done })} className={entry.done ? "text-green" : "text-text-faint hover:text-text"}>
          ✓
        </button>
        <button onClick={onDelete} className="text-pink/70 hover:text-pink font-mono">
          ✕
        </button>
      </div>
    </div>
  );
}
