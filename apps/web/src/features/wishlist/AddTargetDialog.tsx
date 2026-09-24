import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { entityConfigs, interpolateLabel, type MasterDataRow } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useIncomeClaims, useIncomeSources, useInventory } from "../planner/api.ts";
import { usePityState } from "../pull-log/api.ts";
import { useActiveGame } from "../../state/gameContext.tsx";
import { useCreateWishlistTarget, useWishlistTargets } from "./api.ts";
import { computeAffordability } from "./wishlistData.ts";

const selectCls = "w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm";

/** Screen 09's "Add wishlist target" dialog. The banner is auto-resolved from whichever real banner already features the picked character/{term:equipmentItem} (soonest upcoming one preferred) — there's no separate banner picker, since a target's banner is a fact about the target, not a free choice. */
export function AddTargetDialog({ onClose }: { onClose: () => void }) {
  const { config: gameConfig } = useActiveGame();
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: existingTargets = [] } = useWishlistTargets();
  const { data: inventory } = useInventory();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const { data: pools = [] } = usePityState();
  const create = useCreateWishlistTarget();

  const activeTargetCount = existingTargets.filter((t) => t.status === "active").length;

  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ kind: "character" | "equipment"; row: MasterDataRow } | null>(null);
  const [priority, setPriority] = useState(activeTargetCount + 1);
  const [copiesWanted, setCopiesWanted] = useState(0);
  const [reserveFromToday, setReserveFromToday] = useState(true);

  const pullCurrency = useMemo(() => currencyRows.find((c) => (c.pullCost as number | null) != null), [currencyRows]);

  const banner = useMemo(() => {
    if (!picked) return undefined;
    const matches = bannerRows.filter((b) =>
      picked.kind === "character" ? b.featuredCharacterId === picked.row.id : b.featuredEquipmentId === picked.row.id,
    );
    return matches.sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")))[0];
  }, [picked, bannerRows]);

  const [budgetCeiling, setBudgetCeiling] = useState(60);
  const cap = (banner?.pity as number | null) ?? 90;

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chars = characterRows.map((row) => ({ kind: "character" as const, row }));
    const equip = equipmentRows.map((row) => ({ kind: "equipment" as const, row }));
    const all = [...chars, ...equip];
    if (!q) return all.slice(0, 8);
    return all.filter((c) => c.row.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, characterRows, equipmentRows]);

  const preview = useMemo(() => {
    if (!picked) return null;
    const fakeTarget = {
      id: -1,
      targetCharacterId: picked.kind === "character" ? picked.row.id : null,
      targetEquipmentId: picked.kind === "equipment" ? picked.row.id : null,
      bannerId: banner?.id ?? null,
      priority,
      copiesWanted,
      budgetCeilingPulls: budgetCeiling,
      reserveFromToday,
      status: "active" as const,
      resolvedAt: null,
      lockedDecision: null,
      lockedAt: null,
      notes: null,
      createdAt: Math.floor(Date.now() / 1000),
    };
    const activeTargets = [...existingTargets.filter((t) => t.status === "active"), fakeTarget].sort((a, b) => a.priority - b.priority);
    return computeAffordability(fakeTarget, activeTargets, banner, pullCurrency, inventory?.currencies ?? [], incomeSources, claims, pools);
  }, [picked, banner, priority, copiesWanted, budgetCeiling, reserveFromToday, existingTargets, pullCurrency, inventory, incomeSources, claims, pools]);

  const pullCost = (pullCurrency?.pullCost as number | null) ?? null;

  function submit() {
    if (!picked) return;
    create.mutate(
      {
        targetCharacterId: picked.kind === "character" ? picked.row.id : null,
        targetEquipmentId: picked.kind === "equipment" ? picked.row.id : null,
        bannerId: banner?.id ?? null,
        priority,
        copiesWanted,
        budgetCeilingPulls: budgetCeiling,
        reserveFromToday,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[452px] max-w-full bg-panel border border-white/10 rounded-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">Add wishlist target</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label={`Character or ${interpolateLabel("{term:equipmentItem}", gameConfig.terms)}`}>
            {picked ? (
              <div className="flex items-center gap-2 bg-white/5 border border-blue/50 rounded-md px-2.5 py-1.5 text-sm">
                <span className="flex-1">{picked.row.name}</span>
                <button onClick={() => setPicked(null)} className="text-text-faint hover:text-text text-xs">
                  change
                </button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search characters and items…"
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm mb-1.5"
                />
                <div className="border border-white/10 rounded-md overflow-hidden bg-surface2 max-h-40 overflow-y-auto">
                  {candidates.map((c) => (
                    <button
                      key={`${c.kind}:${c.row.id}`}
                      onClick={() => setPicked(c)}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs text-text-dim hover:bg-white/5"
                    >
                      <span className="flex-1">{c.row.name}</span>
                      <span className="font-mono text-[10px] text-text-faint">{c.kind === "character" ? "character" : "item"}</span>
                    </button>
                  ))}
                  {candidates.length === 0 && <div className="px-2.5 py-2 text-xs text-text-faint">No matches.</div>}
                </div>
              </>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Priority">
              <div className="flex gap-1">
                {Array.from({ length: Math.max(4, activeTargetCount + 1) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 text-center font-mono text-[11px] py-1.5 rounded ${
                      priority === p ? "bg-pink text-ink" : "bg-white/5 border border-white/10 text-text-dim"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Copies wanted">
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md px-1.5 py-1">
                <button onClick={() => setCopiesWanted((v) => Math.max(0, v - 1))} className="w-5 h-5 rounded bg-white/5 text-text-dim">
                  −
                </button>
                <span className="flex-1 text-center font-mono text-sm font-semibold">S{copiesWanted}</span>
                <button onClick={() => setCopiesWanted((v) => v + 1)} className="w-5 h-5 rounded bg-white/5 text-text-dim">
                  +
                </button>
              </div>
            </Field>
          </div>

          <Field label="Budget ceiling">
            <input
              type="range"
              min={0}
              max={cap}
              value={Math.min(budgetCeiling, cap)}
              onChange={(e) => setBudgetCeiling(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between font-mono text-[10px] text-text-faint">
              <span>0</span>
              <span className="text-amber">
                {budgetCeiling} pulls{pullCost != null ? ` · ${(budgetCeiling * pullCost).toLocaleString()} ${pullCurrency?.shortCode ?? pullCurrency?.name ?? ""}` : ""}
              </span>
              <span>{cap}</span>
            </div>
          </Field>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setReserveFromToday((v) => !v)}
              className={`w-[22px] h-[13px] rounded-full flex-none p-0.5 flex ${reserveFromToday ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
            >
              <span className="w-[9px] h-[9px] rounded-full bg-ink" />
            </button>
            <span className="flex-1">Reserve savings from today</span>
          </div>

          {picked && (
            <div className="bg-green/5 border border-green/25 rounded-md px-2.5 py-2 text-xs text-text-dim leading-relaxed">
              {banner ? (
                <>
                  {banner.startDate ? `Banner opens ${banner.startDate}. ` : "Banner is live. "}
                  You'll hold <span className="text-green font-mono">{preview?.available ?? 0} pulls</span>
                  {preview?.guaranteeReachable != null ? ` and ${preview.guaranteeReachable ? "a guarantee" : "no guarantee yet"}` : ""} by then.
                </>
              ) : (
                "No banner announced for this target yet — affordability will show once one's added to master data."
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2">
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CANCEL
          </button>
          <button
            onClick={submit}
            disabled={!picked || create.isPending}
            className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40"
          >
            ADD TARGET
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
