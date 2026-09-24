import { entityConfigs } from "@grindstone/shared";
import { SubstatsEditor } from "../../components/SubstatsEditor.tsx";
import { moduleTargetsApi, useEntityList, type ModuleTargetRow } from "./api.ts";

// Tracking every possible RNG roll isn't feasible (and RNG is locked in on
// acquisition and never rerolled), so master data instead records one or
// more named "ideal piece" targets per piece to farm toward — ATK build
// vs. Crit build, etc. — each with a main-stat target and a tag list of
// {stat, value} substats (no priority ranking, per the "somewhere in
// between" call: structured pairs, not a full child table per substat
// since nothing else references one individually). The same piece is
// often farmed several times for different characters with different
// substat needs, so each target can optionally name which character it's
// for — that's why multiple target rows per piece is the normal case, not
// an edge case.
export function ModuleTargetsSection({ parentId: moduleId }: { parentId: number }) {
  const { data: targets = [] } = moduleTargetsApi.useList(moduleId);
  const createRow = moduleTargetsApi.useCreate(moduleId);
  const updateRow = moduleTargetsApi.useUpdate(moduleId);
  const deleteRow = moduleTargetsApi.useDelete(moduleId);
  const { data: characters = [] } = useEntityList(entityConfigs.characters);

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Target pieces</span>
        <button
          onClick={() => createRow.mutate({ label: "New target", substats: "[]" })}
          className="text-amber font-mono text-[10px]"
        >
          + ADD TARGET
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {targets.length === 0 && <div className="p-3 text-xs text-text-faint">No target pieces yet.</div>}
        {targets.map((target) => (
          <TargetRow
            key={target.id}
            target={target}
            characters={characters}
            onUpdate={(body) => updateRow.mutate({ id: target.id, body })}
            onDelete={() => deleteRow.mutate(target.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TargetRow({
  target,
  characters,
  onUpdate,
  onDelete,
}: {
  target: ModuleTargetRow;
  characters: { id: number; name: string }[];
  onUpdate: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-2.5 flex flex-col gap-2 text-xs">
      <div className="flex gap-2 items-center">
        <input
          defaultValue={target.label}
          placeholder="Target label (e.g. Crit build)"
          className="flex-1 bg-surface border border-white/10 rounded px-1.5 py-1 font-medium"
          onBlur={(e) => onUpdate({ label: e.target.value })}
        />
        <select
          defaultValue={target.forCharacterId ?? ""}
          className="w-32 bg-surface border border-white/10 rounded px-1.5 py-1"
          onChange={(e) => onUpdate({ forCharacterId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">for: any</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          defaultValue={target.mainStatTarget ?? ""}
          placeholder="Main stat"
          className="w-28 bg-surface border border-white/10 rounded px-1.5 py-1"
          onBlur={(e) => onUpdate({ mainStatTarget: e.target.value || null })}
        />
        <button onClick={onDelete} className="text-pink/70 hover:text-pink font-mono">
          ✕
        </button>
      </div>
      <SubstatsEditor substats={target.substats} onChange={(next) => onUpdate({ substats: JSON.stringify(next) })} />
      <textarea
        defaultValue={target.notes ?? ""}
        placeholder="Notes (optional)"
        rows={1}
        className="bg-surface border border-white/10 rounded px-1.5 py-1 text-[11px] resize-none text-text-dim"
        onBlur={(e) => onUpdate({ notes: e.target.value || null })}
      />
    </div>
  );
}
