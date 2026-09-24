import { useEffect, useMemo, useState } from "react";
import { entityConfigs, type MasterDataRow, type WishlistTargetRow } from "@grindstone/shared";
import { useEntityList, useRankTiers } from "../master-data/api.ts";
import { useIncomeClaims, useIncomeSources, useInventory } from "../planner/api.ts";
import { usePityState, usePullLog } from "../pull-log/api.ts";
import { useRoster } from "../roster/api.ts";
import {
  useDeleteWishlistTarget,
  useLockTarget,
  useReorderWishlistTargets,
  useSavingsRules,
  useSetTargetStatus,
  useWishlistTargets,
} from "./api.ts";
import {
  computeAffordability,
  computeTargetStatus,
  computeTheCall,
  evaluateSavingsRules,
  targetLabel,
  type TargetAffordability,
} from "./wishlistData.ts";
import { AddTargetDialog } from "./AddTargetDialog.tsx";
import { RemoveTargetDialog } from "./RemoveTargetDialog.tsx";

export function TargetsTab() {
  const rankTiers = useRankTiers();
  const { data: targets = [] } = useWishlistTargets();
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: inventory } = useInventory();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const { data: pools = [] } = usePityState();
  const { data: pulls = [] } = usePullLog();
  const { data: rules = [] } = useSavingsRules();
  const { data: roster = [] } = useRoster();

  const reorder = useReorderWishlistTargets();
  const setStatus = useSetTargetStatus();
  const lockTarget = useLockTarget();
  const deleteTarget = useDeleteWishlistTarget();

  const [dragId, setDragId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<WishlistTargetRow | null>(null);

  const characterById = useMemo(() => new Map(characterRows.map((c) => [c.id, c])), [characterRows]);
  const equipmentById = useMemo(() => new Map(equipmentRows.map((e) => [e.id, e])), [equipmentRows]);
  const bannerById = useMemo(() => new Map(bannerRows.map((b) => [b.id, b])), [bannerRows]);
  const pullCurrency = useMemo(() => currencyRows.find((c) => (c.pullCost as number | null) != null), [currencyRows]);

  const statusByTarget = useMemo(() => {
    const map = new Map<number, WishlistTargetRow["status"]>();
    for (const t of targets) map.set(t.id, computeTargetStatus(t, t.bannerId != null ? bannerById.get(t.bannerId) : undefined, pulls));
    return map;
  }, [targets, bannerById, pulls]);

  // Persist an auto-resolved status once it's real (obtained/expired) — keeps the stored row truthful for Pull History's own fetch, without a cron: this just runs whenever the derived read disagrees with what's stored.
  useEffect(() => {
    for (const t of targets) {
      const derived = statusByTarget.get(t.id);
      if (t.status === "active" && (derived === "obtained" || derived === "expired")) {
        setStatus.mutate({ id: t.id, status: derived });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, statusByTarget]);

  const activeTargets = useMemo(
    () => targets.filter((t) => statusByTarget.get(t.id) === "active").sort((a, b) => a.priority - b.priority),
    [targets, statusByTarget],
  );

  const affordabilityByTarget = useMemo(() => {
    const map = new Map<number, TargetAffordability>();
    for (const t of activeTargets) {
      const banner = t.bannerId != null ? bannerById.get(t.bannerId) : undefined;
      map.set(t.id, computeAffordability(t, activeTargets, banner, pullCurrency, inventory?.currencies ?? [], incomeSources, claims, pools));
    }
    return map;
  }, [activeTargets, bannerById, pullCurrency, inventory, incomeSources, claims, pools]);

  const characterBuilds = useMemo(
    () => roster.filter((r) => r.build).map((r) => ({ characterId: r.character.id, resonanceLevel: r.build!.resonanceLevel })),
    [roster],
  );

  const ruleEvaluations = useMemo(
    () =>
      evaluateSavingsRules(rules.filter((r) => r.enabled), {
        targets: activeTargets,
        affordabilityByTarget,
        banners: bannerById,
        characterById,
        equipmentById,
        characterBuilds,
      }),
    [rules, activeTargets, affordabilityByTarget, bannerById, characterById, equipmentById, characterBuilds],
  );

  const verdict = useMemo(
    () => computeTheCall(activeTargets, affordabilityByTarget, ruleEvaluations, characterById, equipmentById),
    [activeTargets, affordabilityByTarget, ruleEvaluations, characterById, equipmentById],
  );

  // --- lifetime stats (real aggregates over the existing pull log, nothing new tracked) ---
  const totalPulls = pulls.reduce((a, p) => a + p.quantity, 0);
  const topRank = rankTiers[rankTiers.length - 1]?.name;
  const sRanks = pulls.filter((p) => p.rank === topRank).reduce((a, p) => a + p.quantity, 0);
  const allHistory = pools.flatMap((p) => p.history);
  const avgPity = allHistory.length ? allHistory.reduce((a, h) => a + h.pityAtPull, 0) / allHistory.length : null;
  const fiftyFiftyEntries = allHistory.filter((h) => h.fiftyFiftyResult === "won" || h.fiftyFiftyResult === "lost");
  const fiftyFiftyWon = fiftyFiftyEntries.filter((h) => h.fiftyFiftyResult === "won").length;

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const ids = activeTargets.map((t) => t.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
    setDragId(null);
  }

  const reservedTotal = activeTargets.filter((t) => t.reserveFromToday).reduce((a, t) => a + t.budgetCeilingPulls, 0);
  const topPool = pools[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-faint">
            {activeTargets.length} target{activeTargets.length === 1 ? "" : "s"} · {reservedTotal} pulls reserved
            {topPool ? ` · ${topPool.currentPity} pity` : ""}
          </span>
          <div className="flex-1" />
          <button onClick={() => setShowAdd(true)} className="text-[11px] font-mono px-2.5 py-1.5 rounded bg-amber text-ink">
            + ADD TARGET
          </button>
        </div>

        {activeTargets.length === 0 && <div className="p-4 text-xs text-text-faint bg-surface border border-border2 rounded-lg">No active targets — add one to get a verdict.</div>}

        {activeTargets.map((t, i) => (
          <TargetCard
            key={t.id}
            target={t}
            index={i}
            characterById={characterById}
            equipmentById={equipmentById}
            banner={t.bannerId != null ? bannerById.get(t.bannerId) : undefined}
            affordability={affordabilityByTarget.get(t.id)}
            dragging={dragId === t.id}
            onDragStart={() => setDragId(t.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(t.id)}
            onRemove={() => setRemoveTarget(t)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">THE CALL</div>
          <div className="p-2.5 flex flex-col gap-2">
            <div className="font-display font-bold text-[15px] leading-tight">{verdict.headline}</div>
            <div className="text-xs text-text-dim leading-relaxed">{verdict.reason}</div>
            {verdict.targetId != null && (
              <button
                onClick={() => lockTarget.mutate({ id: verdict.targetId!, decision: verdict.action === "none" ? "hold" : verdict.action })}
                className="font-mono text-[11px] py-1.5 rounded bg-green text-ink"
              >
                LOCK PLAN
              </button>
            )}
            {(() => {
              const top = activeTargets[0];
              if (top?.lockedDecision) {
                return (
                  <div className="font-mono text-[10px] text-text-faint">
                    locked: {top.lockedDecision} · {new Date((top.lockedAt ?? 0) * 1000).toLocaleDateString()}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">SAVINGS RULES</div>
          <div className="flex flex-col">
            {rules.length === 0 && <div className="p-3 text-xs text-text-faint">No rules yet.</div>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs">
                <span className={`w-2.5 h-2.5 rounded-full flex-none ${r.enabled ? "bg-green" : "bg-white/20"}`} />
                <span className="flex-1">{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">LIFETIME</div>
          <div className="p-2.5 grid grid-cols-2 gap-2.5">
            <div>
              <div className="font-mono text-[9px] text-text-faint">PULLS</div>
              <div className="font-display font-bold text-lg">{totalPulls}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">{topRank}-RANKS</div>
              <div className="font-display font-bold text-lg text-amber">{sRanks}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">AVG PITY</div>
              <div className="font-display font-bold text-lg">{avgPity != null ? avgPity.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">50/50 WON</div>
              <div className="font-display font-bold text-lg text-pink">
                {fiftyFiftyWon} / {fiftyFiftyEntries.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddTargetDialog onClose={() => setShowAdd(false)} />}
      {removeTarget && (
        <RemoveTargetDialog
          target={removeTarget}
          label={targetLabel(removeTarget, characterById, equipmentById)}
          reserved={affordabilityByTarget.get(removeTarget.id)?.reserved ?? 0}
          onKeep={() => setRemoveTarget(null)}
          onRemove={() => {
            setStatus.mutate({ id: removeTarget.id, status: "deferred" });
            setRemoveTarget(null);
          }}
        />
      )}
    </div>
  );
}

function TargetCard({
  target,
  index,
  characterById,
  equipmentById,
  banner,
  affordability,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onRemove,
}: {
  target: WishlistTargetRow;
  index: number;
  characterById: Map<number, MasterDataRow>;
  equipmentById: Map<number, MasterDataRow>;
  banner: MasterDataRow | undefined;
  affordability: TargetAffordability | undefined;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onRemove: () => void;
}) {
  const label = targetLabel(target, characterById, equipmentById);
  const item = target.targetCharacterId != null ? characterById.get(target.targetCharacterId) : equipmentById.get(target.targetEquipmentId ?? -1);
  // Full static class strings per branch — Tailwind's scanner can't resolve `bg-${var}/10`-style interpolation.
  const verdictCls =
    affordability?.verdict === "AFFORDABLE"
      ? "bg-green/10 border-green/40 text-green"
      : affordability?.verdict === "TIGHT"
        ? "bg-amber/10 border-amber/40 text-amber"
        : "bg-pink/10 border-pink/40 text-pink";
  const hero = index === 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-surface border rounded-lg overflow-hidden ${hero ? "border-pink/30" : "border-border2"} ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex gap-3 p-2.5">
        <div className={`flex-none rounded-md border overflow-hidden bg-surface2 ${hero ? "w-[78px] h-[104px]" : "w-16 h-[86px]"} border-white/10`}>
          {item?.imageUrl ? <img src={item.imageUrl as string} className="w-full h-full object-cover" /> : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="font-mono text-[9px] bg-white/10 text-text-dim px-1.5 py-0.5 rounded tracking-wide">P{target.priority}</span>
            <span className="font-display font-bold text-[15px]">{label}</span>
            <div className="flex-1" />
            {affordability?.verdict && (
              <span className={`font-mono text-[10px] px-2 py-1 rounded border tracking-wide ${verdictCls}`}>
                {affordability.verdict} · {affordability.affordabilityPercent}%
              </span>
            )}
            <button onClick={onRemove} className="text-text-faint hover:text-pink text-xs px-1">
              ✕
            </button>
          </div>
          <div className="text-[11px] text-text-faint mb-2">
            {banner ? `${banner.name} · ${banner.startDate ? `opens ${banner.startDate}` : "live"}${affordability?.daysUntilBannerEnd != null ? ` · ${affordability.daysUntilBannerEnd}d left` : ""}` : "No banner yet"}
          </div>
          <div className="relative h-[20px] rounded bg-white/5 overflow-hidden mb-1.5">
            {affordability && target.budgetCeilingPulls > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-green/40 flex items-center px-2 font-mono text-[10px]"
                style={{ width: `${Math.min(100, (affordability.available / target.budgetCeilingPulls) * 100)}%` }}
              >
                {affordability.available} AVAILABLE
              </div>
            )}
            <div className="absolute right-2 inset-y-0 flex items-center font-mono text-[10px] text-text-dim">BUDGET {target.budgetCeilingPulls}</div>
          </div>
          <div className="flex gap-1.5 flex-wrap font-mono text-[11px]">
            {target.copiesWanted > 1 && <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">S{target.copiesWanted} wanted</span>}
            {target.reserveFromToday && <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">reserving</span>}
            {affordability?.guaranteeReachable === true && <span className="bg-green/10 border border-green/30 text-green px-1.5 py-0.5 rounded">guarantee reachable</span>}
            {affordability?.guaranteeReachable === false && <span className="bg-pink/10 border border-pink/30 text-pink px-1.5 py-0.5 rounded">guarantee not reachable</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
