import { useStatTargets, useAddStatTarget, useUpdateStatTarget, useDeleteStatTarget } from "./api.ts";

/**
 * User-defined stat target/current pairs — "define an ideal, compare
 * against reality," same pattern as Stage 1's module_targets. Both values
 * are free text (so "218%"/"2,946" display fine); "met" for the ring is
 * decided by parsing the leading number — see buildProgress.ts. Stacked
 * layout (name on its own row) since this renders in a narrow sidebar
 * column where a 4-column grid doesn't fit.
 */
export function StatTargetsSection({ characterId }: { characterId: number }) {
  const { data: targets = [] } = useStatTargets(characterId);
  const addTarget = useAddStatTarget();
  const updateTarget = useUpdateStatTarget();
  const deleteTarget = useDeleteStatTarget();

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Stats</span>
        <button
          onClick={() => addTarget.mutate({ characterId, body: { statName: "New stat", targetValue: "", currentValue: "" } })}
          className="text-amber font-mono text-[10px]"
        >
          + ADD
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {targets.length === 0 && <div className="p-3 text-xs text-text-faint">No stat targets set yet.</div>}
        {targets.map((t) => (
          <div key={t.id} className="p-2 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <input
                defaultValue={t.statName}
                onBlur={(e) => updateTarget.mutate({ characterId, id: t.id, body: { statName: e.target.value } })}
                className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-1 min-w-0"
              />
              <button onClick={() => deleteTarget.mutate({ characterId, id: t.id })} className="text-pink/70 hover:text-pink font-mono">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <div className="font-mono text-[9px] text-text-faint mb-0.5">current</div>
                <input
                  defaultValue={t.currentValue ?? ""}
                  onBlur={(e) => updateTarget.mutate({ characterId, id: t.id, body: { currentValue: e.target.value } })}
                  className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-center font-mono"
                />
              </div>
              <div>
                <div className="font-mono text-[9px] text-text-faint mb-0.5">target</div>
                <input
                  defaultValue={t.targetValue ?? ""}
                  onBlur={(e) => updateTarget.mutate({ characterId, id: t.id, body: { targetValue: e.target.value } })}
                  className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-center font-mono"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
