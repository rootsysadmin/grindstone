import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { useEntityList, useRankTierMap } from "../master-data/api.ts";
import { MaterialSwatch } from "../../components/MaterialSwatch.tsx";
import { useInventory, useSetCurrencyBalance, useSetMaterialStock } from "./api.ts";

const rowCls = "grid grid-cols-[26px_1fr_84px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs";
const inputCls = "bg-surface border border-white/10 rounded px-1.5 py-1 text-right font-mono";

/** Screen 09's "Inventory quick-edit" dialog — a single scrollable list of every material and currency, each row saving independently on blur, so both can be updated without navigating between the Materials and Currency tabs. Reuses the exact same hooks/inputs those tabs already use, including the key={currentValue} remount convention (see docs/progress.md Stage 3 — a plain defaultValue input doesn't pick up a server value that changes from outside itself). */
export function InventoryQuickEditDialog({ onClose }: { onClose: () => void }) {
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const rankTierMap = useRankTierMap();
  const { data: inventory } = useInventory();
  const setStock = useSetMaterialStock();
  const setBalance = useSetCurrencyBalance();
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredMaterials = materials.filter((m) => !q || m.name.toLowerCase().includes(q));
  const filteredCurrencies = currencies.filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[420px] max-w-full max-h-[85vh] bg-panel border border-white/10 rounded-lg overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2 flex-none">
          <span className="font-display font-bold text-sm">Inventory quick-edit</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border2 flex-none">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter…"
            className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {filteredMaterials.length > 0 && (
            <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-wide text-text-faint bg-white/[.02] border-b border-border2">
              Materials
            </div>
          )}
          {filteredMaterials.map((m) => {
            const have = inventory?.materials.find((i) => i.materialId === m.id)?.quantity ?? 0;
            return (
              <div key={m.id} className={rowCls}>
                <MaterialSwatch material={{ color: rankTierMap.get(m.rankTierId as number)?.color ?? null, imageUrl: m.imageUrl as string | null, name: m.name }} size={20} />
                <span className="truncate">{m.name}</span>
                <input
                  key={have}
                  type="number"
                  min={0}
                  defaultValue={have}
                  className={inputCls}
                  onBlur={(e) => setStock.mutate({ materialId: m.id as number, quantity: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            );
          })}

          {filteredCurrencies.length > 0 && (
            <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-wide text-text-faint bg-white/[.02] border-b border-border2">
              Currencies
            </div>
          )}
          {filteredCurrencies.map((c) => {
            const balance = inventory?.currencies.find((i) => i.currencyId === c.id)?.balance ?? 0;
            return (
              <div key={c.id} className={rowCls}>
                <div className="w-5 h-5 rounded bg-amber/15 border border-amber/40" />
                <span className="truncate">{c.name}</span>
                <input
                  key={balance}
                  type="number"
                  min={0}
                  defaultValue={balance}
                  className={inputCls}
                  onBlur={(e) => setBalance.mutate({ currencyId: c.id as number, balance: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            );
          })}

          {filteredMaterials.length === 0 && filteredCurrencies.length === 0 && (
            <div className="p-3 text-xs text-text-faint">No matches.</div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-border2 bg-surface2 flex items-center gap-2 flex-none">
          <span className="font-mono text-[10px] text-text-faint flex-1">saves on blur</span>
          <button onClick={onClose} className="font-mono text-xs px-3 py-1.5 rounded-md bg-blue text-[#06202e] font-medium">
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}
