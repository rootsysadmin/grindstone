import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { entityConfigs } from "@grindstone/shared";
import { achievedCount, getCharacterModuleSet, isAchieved } from "../../components/moduleSet.ts";
import { SubstatsEditor } from "../../components/SubstatsEditor.tsx";
import { useAllModuleTargets, useEntityList, useUpdateModuleTarget, type ModuleTargetRow } from "../master-data/api.ts";
import { useRoster } from "../roster/api.ts";

/**
 * Roster-wide gear checklist — the whole point of this tab, per the user:
 * checking which Cartridge/Module target pieces are still outstanding
 * currently means opening each character's own gear menu one at a time
 * (in-game and, before this, in this app too). This is the "one place"
 * rollup instead, same shape as MaterialsTab's roster-wide "what am I
 * still short on" rollup, just for gear targets instead of materials.
 * Deliberately NOT matching real owned pieces' rolled stats against a
 * target — just a manual "obtained" tick per target, per the user's call.
 */
export function GearTab() {
  const { data: roster = [] } = useRoster();
  const { data: modules = [] } = useEntityList(entityConfigs.modules);
  const { data: targets = [] } = useAllModuleTargets();
  const updateTarget = useUpdateModuleTarget();
  const [outstandingOnly, setOutstandingOnly] = useState(true);

  const moduleName = (id: number) => (modules.find((m) => m.id === id)?.name as string | undefined) ?? `#${id}`;

  const rows = useMemo(
    () =>
      roster
        .filter((entry) => entry.build)
        .map((entry) => {
          const set = getCharacterModuleSet(targets, modules, entry.character.id);
          const all = [...set.cartridge, ...set.modules];
          return {
            character: entry.character,
            all,
            outstanding: all.filter((t) => !isAchieved(t)),
          };
        }),
    [roster, targets, modules],
  );

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding.length, 0);
  const totalDefined = rows.reduce((sum, r) => sum + r.all.length, 0);
  const fullyGearedCount = rows.filter((r) => r.all.length > 0 && r.outstanding.length === 0).length;
  const visibleRows = rows.filter((r) => (outstandingOnly ? r.outstanding.length > 0 : r.all.length > 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-faint">across {rows.length} owned characters</span>
        <div className="flex-1" />
        <button
          onClick={() => setOutstandingOnly((v) => !v)}
          className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
            outstandingOnly ? "bg-pink/15 border-pink/40 text-pink" : "bg-white/5 border-white/10 text-text-dim"
          }`}
        >
          OUTSTANDING ONLY · {totalOutstanding}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Target pieces defined</div>
          <div className="font-display font-bold text-xl">{totalDefined}</div>
        </div>
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Still needed</div>
          <div className="font-display font-bold text-xl text-pink">{totalOutstanding}</div>
        </div>
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Fully geared</div>
          <div className="font-display font-bold text-xl text-green">{fullyGearedCount}</div>
        </div>
      </div>

      {visibleRows.length === 0 && (
        <div className="text-xs text-text-faint p-3">
          {outstandingOnly ? "Nothing outstanding — every defined target piece is checked off." : "No target pieces defined yet."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visibleRows.map((r) => (
          <div key={r.character.id} className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 flex items-center justify-between">
              <Link to={`/roster/${r.character.id}`} className="font-semibold text-sm hover:text-amber">
                {r.character.name as string}
              </Link>
              <span className="font-mono text-[10px] text-text-faint">
                {achievedCount(r.all)}/{r.all.length} obtained
              </span>
            </div>
            <div className="flex flex-col divide-y divide-border2">
              {(outstandingOnly ? r.outstanding : r.all).map((target) => (
                <GearRow
                  key={target.id}
                  target={target}
                  moduleName={moduleName(target.moduleId)}
                  onUpdate={(body) => updateTarget.mutate({ moduleId: target.moduleId, id: target.id, body })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GearRow({
  target,
  moduleName,
  onUpdate,
}: {
  target: ModuleTargetRow;
  moduleName: string;
  onUpdate: (body: Record<string, unknown>) => void;
}) {
  const achieved = isAchieved(target);
  return (
    <div className="p-2.5 flex flex-col gap-1.5 text-xs">
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
        <span className={`font-medium flex-1 truncate ${achieved ? "text-text-dim line-through" : ""}`}>
          {moduleName}
          {target.label ? ` — ${target.label}` : ""}
        </span>
        {target.mainStatTarget && <span className="text-[11px] text-text-dim">{target.mainStatTarget}</span>}
      </div>
      <SubstatsEditor substats={target.substats} onChange={(next) => onUpdate({ substats: JSON.stringify(next) })} />
    </div>
  );
}
