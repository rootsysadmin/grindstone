import { useMemo } from "react";
import { Link } from "react-router-dom";
import { entityConfigs } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { usePullLog } from "../pull-log/api.ts";
import { useWishlistTargets } from "./api.ts";
import { computeTargetStatus, pullHistoryForTarget, targetLabel } from "./wishlistData.ts";

const OUTCOME_CLS: Record<string, string> = {
  obtained: "text-green",
  expired: "text-pink",
  deferred: "text-text-dim",
};

export function PullHistoryTab() {
  const { data: targets = [] } = useWishlistTargets();
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: pulls = [] } = usePullLog();

  const characterById = useMemo(() => new Map(characterRows.map((c) => [c.id, c])), [characterRows]);
  const equipmentById = useMemo(() => new Map(equipmentRows.map((e) => [e.id, e])), [equipmentRows]);
  const bannerById = useMemo(() => new Map(bannerRows.map((b) => [b.id, b])), [bannerRows]);

  const resolved = useMemo(() => {
    return targets
      .map((t) => ({ target: t, status: computeTargetStatus(t, t.bannerId != null ? bannerById.get(t.bannerId) : undefined, pulls) }))
      .filter((r) => r.status !== "active")
      .map((r) => ({ ...r, outcome: pullHistoryForTarget({ ...r.target, status: r.status }, pulls) }))
      .sort((a, b) => (b.target.resolvedAt ?? b.target.createdAt) - (a.target.resolvedAt ?? a.target.createdAt));
  }, [targets, bannerById, pulls]);

  const obtainedCount = resolved.filter((r) => r.status === "obtained").length;
  const expiredCount = resolved.filter((r) => r.status === "expired").length;
  const avgSpend = resolved.length ? Math.round(resolved.reduce((a, r) => a + r.outcome.spent, 0) / resolved.length) : 0;
  const underBudget = resolved.filter((r) => r.outcome.spent <= r.outcome.budgeted).length;
  const overrunEntries = resolved.filter((r) => r.outcome.spent > r.outcome.budgeted);
  const avgOverrun = overrunEntries.length ? Math.round(overrunEntries.reduce((a, r) => a + (r.outcome.spent - r.outcome.budgeted), 0) / overrunEntries.length) : 0;

  const expiredAtLowPriority = resolved.filter((r) => r.status === "expired" && r.target.priority > 1).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_312px] gap-3">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border2">
          <span className="font-mono text-[11px] text-text-faint">
            {resolved.length} past targets · {obtainedCount} obtained · {expiredCount} expired unpulled
          </span>
          <div className="flex-1" />
          <Link to="/today" className="font-mono text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-text-dim hover:text-text">
            FULL PULL LOG →
          </Link>
        </div>
       <div className="overflow-x-auto">
        <div className="min-w-[620px]">
        <div
          className="grid gap-2 px-2.5 py-1.5 border-b border-border2 font-mono text-[9px] tracking-wide text-text-faint"
          style={{ gridTemplateColumns: "34px 1fr 130px 90px 74px 74px 100px" }}
        >
          <span />
          <span>TARGET</span>
          <span>BANNER</span>
          <span className="text-right">BUDGETED</span>
          <span className="text-right">SPENT</span>
          <span className="text-right">50/50</span>
          <span className="text-right">OUTCOME</span>
        </div>
        {resolved.length === 0 && <div className="p-4 text-xs text-text-faint">No resolved targets yet.</div>}
        {resolved.map(({ target, status, outcome }) => {
          const banner = target.bannerId != null ? bannerById.get(target.bannerId) : undefined;
          const item = target.targetCharacterId != null ? characterById.get(target.targetCharacterId) : equipmentById.get(target.targetEquipmentId ?? -1);
          return (
            <div
              key={target.id}
              className={`grid gap-2 items-center px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs ${status === "deferred" ? "opacity-60" : ""}`}
              style={{ gridTemplateColumns: "34px 1fr 130px 90px 74px 74px 100px" }}
            >
              <span className="w-[22px] h-[22px] rounded bg-surface2 border border-white/10 overflow-hidden flex-none">
                {item?.imageUrl ? <img src={item.imageUrl as string} className="w-full h-full object-cover" /> : null}
              </span>
              <span className="font-semibold truncate">{targetLabel(target, characterById, equipmentById)}</span>
              <span className="font-mono text-[11px] text-text-dim truncate">{banner?.name ?? "—"}</span>
              <span className="font-mono text-[11px] text-text-dim text-right">{outcome.budgeted}</span>
              <span className="font-mono text-[11px] text-right">{outcome.spent}</span>
              <span
                className={`font-mono text-[11px] text-right ${outcome.fiftyFiftyResult === "won" ? "text-green" : outcome.fiftyFiftyResult === "lost" ? "text-pink" : "text-text-faint"}`}
              >
                {outcome.fiftyFiftyResult ?? "n/a"}
              </span>
              <span className={`font-mono text-[11px] text-right ${OUTCOME_CLS[status] ?? "text-text-dim"}`}>{status}</span>
            </div>
          );
        })}
        </div>
       </div>
        <div className="px-2.5 py-2 border-t border-border2 bg-amber/5 flex items-center gap-3.5 font-mono text-[11px]">
          <span className="text-text-faint">BUDGET ACCURACY</span>
          <span className="text-green">
            {underBudget} of {resolved.length} came in under budget
          </span>
          <div className="flex-1" />
          <span className="text-text-faint">avg overrun +{avgOverrun} pulls</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">HIT RATE</div>
          <div className="p-2.5 grid grid-cols-2 gap-2.5">
            <div>
              <div className="font-mono text-[9px] text-text-faint">TARGETS SET</div>
              <div className="font-display font-bold text-lg">{targets.length}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">OBTAINED</div>
              <div className="font-display font-bold text-lg text-green">{obtainedCount}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">EXPIRED</div>
              <div className="font-display font-bold text-lg text-pink">{expiredCount}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] text-text-faint">AVG SPEND</div>
              <div className="font-display font-bold text-lg">{avgSpend}</div>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">BUDGET vs. ACTUAL</div>
          <div className="p-2.5 flex flex-col gap-2 text-xs">
            {resolved.slice(0, 6).map(({ target, outcome }) => {
              const over = outcome.spent > outcome.budgeted;
              return (
                <div key={target.id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-text-dim">{targetLabel(target, characterById, equipmentById)}</span>
                    <span className={`font-mono text-[11px] ${over ? "text-pink" : "text-green"}`}>
                      {outcome.spent} / {outcome.budgeted}
                    </span>
                  </div>
                  <div className="h-[5px] rounded bg-white/10">
                    <div className={`h-full rounded ${over ? "bg-pink" : "bg-green"}`} style={{ width: `${Math.min(100, (outcome.spent / Math.max(1, outcome.budgeted)) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {resolved.length === 0 && <div className="text-text-faint">Nothing resolved yet.</div>}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">WHY TARGETS EXPIRED</div>
          <div className="p-2.5 text-xs text-text-dim leading-relaxed">
            {expiredCount === 0
              ? "Nothing has expired unpulled yet."
              : `${expiredCount} target${expiredCount === 1 ? "" : "s"} expired unpulled. ${expiredAtLowPriority} of ${expiredCount} were priority 2 or lower when their banner ended — likely reserve rules holding pulls for something higher.`}
          </div>
        </div>
      </div>
    </div>
  );
}
