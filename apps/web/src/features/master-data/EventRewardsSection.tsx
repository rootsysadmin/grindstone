import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { eventRewardsApi, useEntityList } from "./api.ts";

// An event's rewards are usually a mix of several currencies and
// materials, so each is its own row rather than two flat fields that could
// only ever hold one value.
export function EventRewardsSection({ parentId: eventId }: { parentId: number }) {
  const { data: rewards = [] } = eventRewardsApi.useList(eventId);
  const createRow = eventRewardsApi.useCreate(eventId);
  const updateRow = eventRewardsApi.useUpdate(eventId);
  const deleteRow = eventRewardsApi.useDelete(eventId);
  const { data: allMaterials = [] } = useEntityList(entityConfigs.materials);
  const { data: allCurrencies = [] } = useEntityList(entityConfigs.currencies);
  const [kind, setKind] = useState<"currency" | "material">("currency");

  const materialName = (id: number | null) => allMaterials.find((m) => m.id === id)?.name ?? "— unset";
  const currencyName = (id: number | null) => allCurrencies.find((c) => c.id === id)?.name ?? "— unset";

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Rewards</span>
        <div className="flex gap-1">
          {(["currency", "material"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`text-[10px] font-mono px-2 py-1 rounded ${kind === k ? "bg-amber text-ink" : "text-text-dim"}`}
            >
              {k.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() =>
              createRow.mutate(
                kind === "currency"
                  ? { kind, currencyId: allCurrencies[0]?.id ?? null, quantity: 0 }
                  : { kind, materialId: allMaterials[0]?.id ?? null, quantity: 0 },
              )
            }
            className="text-amber font-mono text-[10px] ml-1"
          >
            + ADD
          </button>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {rewards.length === 0 && <div className="p-3 text-xs text-text-faint">No rewards listed yet.</div>}
        {rewards.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_90px_28px] gap-2 items-center p-2 text-xs">
            {r.kind === "currency" ? (
              <select
                defaultValue={r.currencyId ?? ""}
                className="bg-surface border border-white/10 rounded px-1.5 py-1"
                onChange={(e) => updateRow.mutate({ id: r.id, body: { currencyId: Number(e.target.value) } })}
              >
                {allCurrencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                defaultValue={r.materialId ?? ""}
                className="bg-surface border border-white/10 rounded px-1.5 py-1"
                onChange={(e) => updateRow.mutate({ id: r.id, body: { materialId: Number(e.target.value) } })}
              >
                {allMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              min={0}
              defaultValue={r.quantity ?? ""}
              placeholder="qty"
              className="bg-surface border border-white/10 rounded px-1.5 py-1 text-center font-mono"
              onBlur={(e) =>
                updateRow.mutate({
                  id: r.id,
                  body: { quantity: e.target.value ? Math.max(0, Number(e.target.value)) : null },
                })
              }
            />
            <button onClick={() => deleteRow.mutate(r.id)} className="text-pink/70 hover:text-pink font-mono">
              ✕
            </button>
            <div className="col-span-3 text-[10px] text-text-faint -mt-1">
              {r.kind === "currency" ? currencyName(r.currencyId) : materialName(r.materialId)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
