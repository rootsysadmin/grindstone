import { useState } from "react";
import { entityConfigs, interpolateLabel, type OwnedAugmentRow } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import { SubstatsEditor } from "../../components/SubstatsEditor.tsx";
import { useAllModuleTargets, useEntityList } from "../master-data/api.ts";
import { useAugments, useCreateAugment, useEquipAugment, useUnequipAugment, useUpdateAugment } from "./api.ts";
import { getCharacterModuleSet } from "../../components/moduleSet.ts";

/**
 * Equipped augment (Cartridge/Module, or a game's own equivalent) grid.
 * Slot index 0 is the conventional "main piece" slot for display only —
 * nothing here hard-enforces "exactly one main type," since that isn't
 * guaranteed to hold the same way in every game (see docs/progress.md).
 * Always live/editable, not gated by the page's Build-fields edit mode —
 * same as every other child-row section in this app.
 *
 * The piece picker is filtered to this character's Set (moduleTargets
 * scoped to them, see moduleSet.ts / ModuleSetSection.tsx) rather than the
 * whole catalog — with a manual "show full catalog anyway" fallback when
 * the character has no Set yet, so a fresh character isn't hard-blocked
 * from equipping anything.
 */
export function AugmentSlotsSection({
  characterId,
  maxSlots,
  onChangeMaxSlots,
}: {
  characterId: number;
  maxSlots: number;
  /** Slot count is a master-data field on the character (some characters have more than others), not build state — editable inline, always live. */
  onChangeMaxSlots?: (v: number) => void;
}) {
  const { config: gameConfig } = useActiveGame();
  const { data: allModules = [] } = useEntityList(entityConfigs.modules);
  const { data: targets = [] } = useAllModuleTargets();
  const { data: equipped = [] } = useAugments({ characterId });
  const { data: allInBag = [] } = useAugments({ unequipped: true });
  const createAugment = useCreateAugment();
  const equipAugment = useEquipAugment();
  const unequipAugment = useUnequipAugment();
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [newModuleId, setNewModuleId] = useState<number | "">("");
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const set = getCharacterModuleSet(targets, allModules, characterId);
  const scopedModuleIds = new Set([...set.cartridge, ...set.modules].map((t) => t.moduleId));
  const hasScopedSet = scopedModuleIds.size > 0;
  const useScoped = hasScopedSet && !showFullCatalog;
  const modules = useScoped ? allModules.filter((m) => scopedModuleIds.has(m.id)) : allModules;
  const inBag = useScoped ? allInBag.filter((a) => scopedModuleIds.has(a.moduleId)) : allInBag;

  const moduleName = (id: number) => (allModules.find((m) => m.id === id)?.name as string | undefined) ?? `#${id}`;
  const bySlot = new Map(equipped.map((a) => [a.slotIndex, a]));

  async function equipNew(slotIndex: number) {
    if (!newModuleId) return;
    const created = await createAugment.mutateAsync({ moduleId: Number(newModuleId) });
    await equipAugment.mutateAsync({ id: created.id, characterId, slotIndex });
    setPickingSlot(null);
    setNewModuleId("");
  }

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
          {interpolateLabel("{term:augmentPlural} · equipped", gameConfig.terms)}
        </span>
        {onChangeMaxSlots && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-text-faint">
            <span>slots</span>
            <button
              onClick={() => onChangeMaxSlots(Math.max(1, maxSlots - 1))}
              className="w-4 h-4 rounded bg-white/5 border border-white/10 grid place-items-center"
            >
              −
            </button>
            <span className="w-4 text-center text-text">{maxSlots}</span>
            <button
              onClick={() => onChangeMaxSlots(maxSlots + 1)}
              className="w-4 h-4 rounded bg-white/5 border border-white/10 grid place-items-center"
            >
              +
            </button>
          </div>
        )}
      </div>
      <div className="p-2.5 grid grid-cols-3 gap-2">
        {Array.from({ length: maxSlots }, (_, i) => i).map((slotIndex) => {
          const a = bySlot.get(slotIndex);
          if (a) {
            return (
              <EquippedCard
                key={slotIndex}
                augment={a}
                moduleName={moduleName(a.moduleId)}
                expanded={expanded === a.id}
                onToggleExpand={() => setExpanded(expanded === a.id ? null : a.id)}
                onUnequip={() => unequipAugment.mutate(a.id)}
              />
            );
          }
          return (
            <div key={slotIndex} className="border border-dashed border-white/15 rounded-md p-2 flex flex-col gap-1.5 min-h-[76px]">
              {pickingSlot === slotIndex ? (
                <>
                  <select
                    value={newModuleId}
                    onChange={(e) => setNewModuleId(e.target.value ? Number(e.target.value) : "")}
                    className="bg-surface border border-white/10 rounded px-1 py-1 text-[10px]"
                  >
                    <option value="">new piece…</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name as string}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => equipNew(slotIndex)} className="text-[10px] text-amber text-left">
                    create + equip
                  </button>
                  {inBag.length > 0 && (
                    <div className="flex flex-col gap-0.5 mt-1 max-h-16 overflow-y-auto">
                      {inBag.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => {
                            equipAugment.mutate({ id: row.id, characterId, slotIndex });
                            setPickingSlot(null);
                          }}
                          className="text-[10px] text-text-dim text-left hover:text-text truncate"
                        >
                          {moduleName(row.moduleId)}
                          {row.mainStat ? ` — ${row.mainStat}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {!hasScopedSet && (
                    <div className="text-[9px] text-text-faint">No target pieces scoped to this character yet.</div>
                  )}
                  {hasScopedSet && (
                    <button
                      onClick={() => setShowFullCatalog((v) => !v)}
                      className="text-[9px] text-text-faint underline text-left"
                    >
                      {showFullCatalog ? "show set only" : "show full catalog anyway"}
                    </button>
                  )}
                  <button onClick={() => setPickingSlot(null)} className="text-[9px] text-text-faint mt-auto">
                    cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setPickingSlot(slotIndex)} className="text-[10px] text-pink/70 h-full grid place-items-center">
                  + equip
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquippedCard({
  augment,
  moduleName,
  expanded,
  onToggleExpand,
  onUnequip,
}: {
  augment: OwnedAugmentRow;
  moduleName: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onUnequip: () => void;
}) {
  const updateAugment = useUpdateAugment();

  return (
    <div className="bg-surface2 border border-amber/25 rounded-md p-2 flex flex-col gap-1">
      <button onClick={onToggleExpand} className="text-left">
        <div className="font-mono text-[11px] text-amber">{augment.mainStat ?? moduleName}</div>
        <div className="text-[10px] text-text-dim">
          {moduleName} · Lv {augment.level ?? "—"}
        </div>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 mt-1 border-t border-white/10 pt-1.5">
          <input
            defaultValue={augment.mainStat ?? ""}
            placeholder="Main stat"
            className="bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px]"
            onBlur={(e) => updateAugment.mutate({ id: augment.id, body: { mainStat: e.target.value || null } })}
          />
          <input
            type="number"
            defaultValue={augment.level ?? ""}
            placeholder="Level"
            className="bg-surface border border-white/10 rounded px-1.5 py-1 text-[10px]"
            onBlur={(e) => updateAugment.mutate({ id: augment.id, body: { level: e.target.value ? Number(e.target.value) : null } })}
          />
          <SubstatsEditor
            substats={augment.substats}
            onChange={(next) => updateAugment.mutate({ id: augment.id, body: { substats: JSON.stringify(next) } })}
          />
        </div>
      )}
      <button onClick={onUnequip} className="text-[10px] text-pink/70 self-start mt-1">
        unequip
      </button>
    </div>
  );
}
