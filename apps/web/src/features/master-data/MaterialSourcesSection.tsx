import { materialSourcesApi } from "./api.ts";

// A material can drop from more than one place — tracked as named rows here
// instead of a single "drops from" text field, so nothing downstream (e.g.
// a farm-route feature) has to parse a vague combined string.
export function MaterialSourcesSection({ parentId: materialId }: { parentId: number }) {
  const { data: sources = [] } = materialSourcesApi.useList(materialId);
  const createRow = materialSourcesApi.useCreate(materialId);
  const updateRow = materialSourcesApi.useUpdate(materialId);
  const deleteRow = materialSourcesApi.useDelete(materialId);

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Sources</span>
        <button
          onClick={() => createRow.mutate({ name: "New source" })}
          className="text-amber font-mono text-[10px]"
        >
          + ADD SOURCE
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {sources.length === 0 && <div className="p-3 text-xs text-text-faint">No sources listed yet.</div>}
        {sources.map((source) => (
          <div key={source.id} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center p-2 text-xs">
            <input
              defaultValue={source.name}
              placeholder="Source name"
              className="bg-surface border border-white/10 rounded px-1.5 py-1"
              onBlur={(e) => updateRow.mutate({ id: source.id, body: { name: e.target.value } })}
            />
            <input
              defaultValue={source.notes ?? ""}
              placeholder="Notes (optional)"
              className="bg-surface border border-white/10 rounded px-1.5 py-1 text-text-dim"
              onBlur={(e) => updateRow.mutate({ id: source.id, body: { notes: e.target.value || null } })}
            />
            <button
              onClick={() => deleteRow.mutate(source.id)}
              className="text-pink/70 hover:text-pink text-[11px] font-mono"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
