import { useMemo, useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { PullLogRow } from "@grindstone/shared";
import { useEntityList, useRankTiers } from "../master-data/api.ts";
import { RankBadge } from "../../components/rankVisuals.tsx";
import { useDeletePullLogEntry, usePityState, usePullLog } from "./api.ts";
import { LogPullDialog } from "./LogPullDialog.tsx";
import {
  buildChartBars,
  computeRates,
  defaultPoolKey,
  fiftyFiftyStrip,
  poolLabel,
  spendByBanner,
  type BannerLite,
} from "./pityView.ts";

export function PullLogTab() {
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const rankTiers = useRankTiers();
  const rankTierByName = new Map(rankTiers.map((t) => [t.name, { name: t.name, color: String(t.color) }]));
  const { data: pulls = [] } = usePullLog();
  const { data: pools = [] } = usePityState();
  const deleteEntry = useDeletePullLogEntry();
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PullLogRow | null>(null);
  const [selectedPoolKey, setSelectedPoolKey] = useState<string | null>(null);
  const [rankOnly, setRankOnly] = useState(false);

  const banners: BannerLite[] = useMemo(
    () =>
      bannerRows.map((b) => ({
        id: b.id as number,
        name: b.name,
        type: (b.type as string | null) ?? null,
        carriesPity: Boolean(b.carriesPity),
        fiftyFifty: Boolean(b.fiftyFifty),
        pity: (b.pity as number | null) ?? null,
      })),
    [bannerRows],
  );

  const activePoolKey = selectedPoolKey ?? defaultPoolKey(pools, pulls, banners);
  const pool = pools.find((p) => p.poolKey === activePoolKey) ?? null;
  const poolBannerIds = new Set(pool?.bannerIds ?? []);
  const poolPulls = pulls.filter((p) => poolBannerIds.has(p.bannerId));
  const topRank = rankTiers[rankTiers.length - 1]?.name;
  const visiblePulls = rankOnly ? poolPulls.filter((p) => p.rank === topRank) : poolPulls;

  const bars = pool ? buildChartBars(pool) : [];
  const maxBarValue = Math.max(1, ...bars.map((b) => b.value));
  const rates = pool ? computeRates(pool, poolPulls, banners) : null;
  const strip = pool ? fiftyFiftyStrip(pool) : [];
  const spend = spendByBanner(pulls, banners);
  const bannerById = new Map(banners.map((b) => [b.id, b]));
  const maxSpend = Math.max(1, ...spend.map((s) => s.count));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-faint">{pulls.reduce((a, p) => a + p.quantity, 0)} pulls logged</span>
        <div className="flex gap-1 bg-white/5 rounded-md p-0.5">
          {pools.map((p) => (
            <button
              key={p.poolKey}
              onClick={() => setSelectedPoolKey(p.poolKey)}
              className={`text-[11px] font-mono px-2 py-1 rounded ${
                p.poolKey === activePoolKey ? "bg-amber text-ink" : "text-text-dim"
              }`}
            >
              {poolLabel(p)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowDialog(true)} className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink">
          ADD PULL
        </button>
      </div>

      {!pool ? (
        <div className="text-xs text-text-faint p-6">No banners in master data yet — add one on the Data page first.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
          <div className="flex flex-col gap-3">
            <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
                  Pity spent per {topRank ?? "top"}-rank
                </span>
                {bars.length > 0 && (
                  <span className="font-mono text-[10px] text-text-faint">
                    avg {(bars.filter((b) => !b.inProgress).reduce((a, b) => a + b.value, 0) / Math.max(1, bars.filter((b) => !b.inProgress).length)).toFixed(1)}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                {bars.length === 0 ? (
                  <div className="text-xs text-text-faint py-4 text-center">No {topRank ?? "top"}-rank pulls logged yet in this pool.</div>
                ) : (
                  <div className="flex items-stretch gap-2 h-24">
                    {bars.map((b, i) => (
                      <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
                        <div
                          className={`w-full rounded-t ${b.inProgress ? "bg-amber/30 border border-amber/50 border-dashed" : "bg-amber"}`}
                          style={{ height: `${Math.max(4, (b.value / maxBarValue) * 100)}%` }}
                        />
                        <span className={`font-mono text-[9px] ${b.inProgress ? "text-amber" : "text-text-faint"}`}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Log</span>
                <div className="flex gap-1.5 font-mono text-[10px]">
                  <button
                    onClick={() => setRankOnly((v) => !v)}
                    className={`px-2 py-1 rounded border ${
                      rankOnly ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                    }`}
                  >
                    {topRank ?? "TOP"} ONLY
                  </button>
                  <span className="px-2 py-1 rounded border bg-white/5 border-white/10 text-text-dim">
                    ALL {poolPulls.reduce((a, p) => a + p.quantity, 0)}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
               <div className="min-w-[560px]">
              <div className="grid grid-cols-[36px_1fr_90px_60px_60px_80px_50px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
                <span></span>
                <span>Item</span>
                <span>Banner</span>
                <span className="text-right">Pity</span>
                <span className="text-right">50/50</span>
                <span className="text-right">When</span>
                <span></span>
              </div>
              <div className="flex flex-col">
                {visiblePulls.length === 0 && <div className="p-3 text-xs text-text-faint">No pulls logged yet.</div>}
                {visiblePulls.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[36px_1fr_90px_60px_60px_80px_50px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs"
                  >
                    <RankBadge tier={rankTierByName.get(p.rank ?? "") ?? null} />
                    <span>
                      {p.itemName}
                      {p.quantity > 1 && <span className="text-text-faint"> ×{p.quantity}</span>}
                    </span>
                    <span className="font-mono text-[11px] text-text-dim truncate">{bannerById.get(p.bannerId)?.name ?? "—"}</span>
                    <span className="font-mono text-[11px] text-right">{p.pityAtPull ?? "—"}</span>
                    <span
                      className={`font-mono text-[11px] text-right ${
                        p.fiftyFiftyResult === "lost" ? "text-pink" : p.fiftyFiftyResult === "won" ? "text-green" : "text-text-faint"
                      }`}
                    >
                      {p.fiftyFiftyResult && p.fiftyFiftyResult !== "n/a" ? p.fiftyFiftyResult.toUpperCase() : "—"}
                    </span>
                    <span className="font-mono text-[11px] text-text-faint text-right">{p.pulledAt}</span>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setEditingEntry(p)} className="text-text-faint hover:text-text" title="Edit">
                        ✎
                      </button>
                      <button onClick={() => deleteEntry.mutate(p.id)} className="text-pink/70 hover:text-pink font-mono" title="Delete">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
               </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {rates && (
              <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Rates</div>
                <div className="p-2.5 flex flex-col gap-2.5">
                  <div>
                    <div className="font-mono text-[9px] text-text-faint">LUCK RATE</div>
                    <div
                      className={`font-display font-bold text-2xl ${
                        rates.luckRatePercent == null
                          ? "text-text-faint"
                          : rates.luckRatePercent >= 66
                            ? "text-green"
                            : rates.luckRatePercent >= 33
                              ? "text-amber"
                              : "text-pink"
                      }`}
                    >
                      {rates.luckRatePercent != null ? `${rates.luckRatePercent.toFixed(1)}%` : "—"}
                    </div>
                    <div className="font-mono text-[9px] text-text-faint">
                      {rates.maxPossible > 0 ? `${rates.actualSpent} of ${rates.maxPossible} pity spent` : "no capped banners logged yet"}
                      {pool?.fiftyFifty ? " · 50/50 losses count too" : ""}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Stat
                      label="LUCKIEST"
                      value={rates.luckiest ? formatPity(rates.luckiest.value) : "—"}
                      sub={rates.luckiest ? formatItemSub(rates.luckiest.itemName, rates.luckiest.count) : undefined}
                      color="text-green"
                    />
                    <Stat
                      label="WORST"
                      value={rates.worst ? formatPity(rates.worst.value) : "—"}
                      sub={rates.worst ? formatItemSub(rates.worst.itemName, rates.worst.count) : undefined}
                      color="text-pink"
                    />
                  </div>
                </div>
              </div>
            )}

            {pool?.fiftyFifty && (
              <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
                  50/50 record
                </div>
                <div className="p-2.5 flex flex-col gap-2">
                  <div className="flex gap-1">
                    {strip.map((s, i) => (
                      <span
                        key={i}
                        className={`flex-1 h-6 rounded grid place-items-center font-mono text-[10px] font-semibold ${
                          s.result === "won"
                            ? "bg-green/15 border border-green/40 text-green"
                            : "bg-pink/15 border border-pink/35 text-pink"
                        }`}
                      >
                        {s.result === "won" ? "W" : "L"}
                      </span>
                    ))}
                    {strip.length === 0 && <span className="text-xs text-text-faint">No {topRank ?? "top"}-rank pulls yet.</span>}
                  </div>
                  {strip.length > 0 && (
                    <div className="text-[11px] text-text-dim leading-relaxed">
                      {strip.filter((s) => s.result === "won").length} of {strip.length}.{" "}
                      {pool.guaranteed
                        ? `Next ${topRank ?? "top"}-rank on this banner is guaranteed.`
                        : `Next ${topRank ?? "top"}-rank is a 50/50.`}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
                Spend by banner
              </div>
              <div className="flex flex-col">
                {spend.length === 0 && <div className="p-3 text-xs text-text-faint">Nothing logged yet.</div>}
                {spend.map((s) => (
                  <div key={s.bannerId} className="grid grid-cols-[1fr_100px_40px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <span className="truncate">{s.bannerName}</span>
                    <div className="h-1.5 rounded bg-white/10">
                      <div className="h-full rounded bg-amber" style={{ width: `${(s.count / maxSpend) * 100}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-text-dim text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {(showDialog || editingEntry) && (
        <LogPullDialog
          entry={editingEntry ?? undefined}
          onClose={() => {
            setShowDialog(false);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}

function formatPity(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatItemSub(itemName: string, count: number) {
  return count > 1 ? `${itemName} (avg of ${count})` : itemName;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-text-faint">{label}</div>
      <div className={`font-display font-bold text-lg ${color}`}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-text-faint truncate">{sub}</div>}
    </div>
  );
}
