import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { SubstatsEditor } from "../../components/SubstatsEditor.tsx";
import {
  useAllModuleTargets,
  useCreateModuleTarget,
  useDeleteModuleTarget,
  useEntityList,
  useUpdateModuleTarget,
  type ModuleTargetRow,
} from "../master-data/api.ts";
import { achievedCount, getCharacterModuleSet, isAchieved } from "../../components/moduleSet.ts";

/**
 * A character's Set: 1 Cartridge target + up to maxSlots Module targets,
 * aggregated from moduleTargets scoped to this character across the whole
 * catalog (see moduleSet.ts) — not a separately created/stored thing.
 * Adding a piece here just creates a moduleTargets row scoped to this
 * character, identical to doing it from that module's own record editor
 * (ModuleTargetsSection.tsx) — this is only a more convenient place to do
 * it from. No hard cap/uniqueness enforcement, per the user's call — the
 * counts are informational only, same soft-guidance style as
 * AugmentSlotsSection's slot-count stepper.
 */
export function ModuleSetSection({ characterId, maxSlots }: { characterId: number; maxSlots: number }) {
  const { data: modules = [] } = useEntityList(entityConfigs.modules);
  const { data: targets = [] } = useAllModuleTargets();
  const createTarget = useCreateModuleTarget();
  const updateTarget = useUpdateModuleTarget();
  const deleteTarget = useDeleteModuleTarget();
  const [newModuleId, setNewModuleId] = useState<number | "">("");

  const set = getCharacterModuleSet(targets, modules, characterId);
  const moduleName = (id: number) => (modules.find((m) => m.id === id)?.name as string | undefined) ?? `#${id}`;

  function addToSet() {
    if (!newModuleId) return;
    createTarget.mutate({
      moduleId: Number(newModuleId),
      body: { label: moduleName(Number(newModuleId)), forCharacterId: characterId, substats: "[]" },
    });
    setNewModuleId("");
  }

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Set</span>
        <span className="font-mono text-[10px] text-text-faint">
          cartridge {achievedCount(set.cartridge)}/{set.cartridge.length} · modules {achievedCount(set.modules)}/{set.modules.length}{" "}
          <span className="text-text-faint/60">(of {maxSlots} slots)</span>
        </span>
      </div>
      <div className="p-2.5 flex flex-col gap-2">
        {set.cartridge.length === 0 && set.modules.length === 0 && (
          <div className="text-xs text-text-faint">No target pieces scoped to this character yet.</div>
        )}
        {[...set.cartridge, ...set.modules].map((target) => (
          <SetRow
            key={target.id}
            target={target}
            moduleName={moduleName(target.moduleId)}
            onUpdate={(body) => updateTarget.mutate({ moduleId: target.moduleId, id: target.id, body })}
            onRemove={() => deleteTarget.mutate({ moduleId: target.moduleId, id: target.id })}
          />
        ))}
        <div className="flex gap-2 items-center pt-1.5 border-t border-border2">
          <select
            value={newModuleId}
            onChange={(e) => setNewModuleId(e.target.value ? Number(e.target.value) : "")}
            className="flex-1 bg-surface border border-white/10 rounded px-1.5 py-1 text-[11px]"
          >
            <option value="">add piece to set…</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name as string} ({m.pieceType as string})
              </option>
            ))}
          </select>
          <button onClick={addToSet} className="text-amber font-mono text-[10px]">
            + add
          </button>
        </div>
      </div>
    </div>
  );
}

function SetRow({
  target,
  moduleName,
  onUpdate,
  onRemove,
}: {
  target: ModuleTargetRow;
  moduleName: string;
  onUpdate: (body: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const achieved = isAchieved(target);
  return (
    <div className={`border rounded-md p-2 flex flex-col gap-1.5 text-xs ${achieved ? "border-green/30 bg-green/5" : "border-border2"}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdate({ achievedAt: achieved ? null : Math.floor(Date.now() / 1000) })}
          title={achieved ? "Mark as not yet obtained" : "Mark as obtained"}
          className={`w-4 h-4 shrink-0 rounded-sm border grid place-items-center text-[10px] ${
            achieved ? "bg-green/80 border-green text-black" : "border-white/25 text-transparent"
          }`}
        >
          ✓
        </button>
        <span className={`font-medium flex-1 truncate ${achieved ? "text-text-dim line-through" : ""}`}>{moduleName}</span>
        <input
          defaultValue={target.mainStatTarget ?? ""}
          placeholder="Main stat"
          className="w-24 bg-surface border border-white/10 rounded px-1.5 py-1 text-[11px]"
          onBlur={(e) => onUpdate({ mainStatTarget: e.target.value || null })}
        />
        <button onClick={onRemove} className="text-pink/70 hover:text-pink font-mono">
          ✕
        </button>
      </div>
      <SubstatsEditor substats={target.substats} onChange={(next) => onUpdate({ substats: JSON.stringify(next) })} />
    </div>
  );
}
