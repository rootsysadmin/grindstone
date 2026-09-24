import type { AllGamesSpend } from "./api.ts";
import { useCancelSpendSubscription, useLinkSubscriptionIncomeSource, useUpdateSpendSettings } from "./api.ts";
import { centsToDollars, computeGameSpendSummary, computeSubscriptionSummary, type SubscriptionVerdict } from "./spendData.ts";
import { useState } from "react";
import { AddSubscriptionDialog } from "./AddSubscriptionDialog.tsx";

function fmt(cents: number): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

const VERDICT_CLS: Record<SubscriptionVerdict, string> = {
  keep: "bg-green/12 border-green/35 text-green",
  review: "bg-amber/14 border-amber/40 text-amber",
  cancel: "bg-pink/16 border-pink text-pink",
};

export function SubscriptionsTab({ data }: { data: AllGamesSpend }) {
  const [addOpen, setAddOpen] = useState(false);
  const linkIncomeSource = useLinkSubscriptionIncomeSource();
  const cancelSub = useCancelSpendSubscription();
  const updateSettings = useUpdateSpendSettings();

  const rows = data.games.flatMap((g) => {
    const gameSummary = computeGameSpendSummary(g);
    return g.subscriptions.map((s) => {
      const linkedSource = s.linkedIncomeSourceId ? g.incomeSources.find((src) => src.id === s.linkedIncomeSourceId) ?? null : null;
      return { game: g, summary: computeSubscriptionSummary(s, g.purchases, g.currencies, linkedSource, g.incomeClaims, gameSummary.dollarsPerPull) };
    });
  });
  const active = rows.filter((r) => r.summary.subscription.status === "active");

  const monthlyTotalCents = active.reduce((a, r) => a + (r.summary.subscription.intervalDays ? Math.round(r.summary.subscription.priceCents * (30 / r.summary.subscription.intervalDays)) : r.summary.subscription.priceCents), 0);
  const lifetimePaidCents = rows.reduce((a, r) => a + r.summary.paidSoFarCents, 0);

  const pullsLostPerYear = active.reduce((a, r) => {
    const pulls = r.summary.pullsGranted;
    const days = r.summary.subscription.intervalDays;
    if (!pulls || !days) return a;
    return a + Math.round(pulls * (365 / days));
  }, 0);
  const dollarsSavedPerYear = active.reduce((a, r) => {
    const days = r.summary.subscription.intervalDays;
    if (!days) return a + centsToDollars(r.summary.subscription.priceCents);
    return a + centsToDollars(r.summary.subscription.priceCents) * (365 / days);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button onClick={() => setAddOpen(true)} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:text-text">
          + SUBSCRIPTION
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_316px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[26px_1fr_100px_140px_90px_100px_90px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  <span></span>
                  <span>Subscription</span>
                  <span className="text-right">Price</span>
                  <span>Claim rate</span>
                  <span className="text-right">Renews</span>
                  <span className="text-right">Paid so far</span>
                  <span className="text-right">Verdict</span>
                </div>
                {rows.map(({ game, summary }) => {
                  const s = summary.subscription;
                  return (
                    <div key={s.id} className={`grid grid-cols-[26px_1fr_100px_140px_90px_100px_90px] gap-2 items-center px-3 py-2 border-b border-border2 last:border-0 text-xs ${s.status === "cancelled" ? "opacity-55" : ""}`}>
                      <span className="w-[18px] h-[18px] rounded bg-white/10 border border-white/15" />
                      <div>
                        <div>{s.label}</div>
                        <div className="font-mono text-[10px] text-text-faint mt-0.5">{game.config.displayName} · {s.cadence}</div>
                      </div>
                      <span className="font-mono text-right">{fmt(s.priceCents)}</span>
                      {summary.claimRatePercent != null ? (
                        <div className="h-[5px] rounded bg-white/10">
                          <div className={`h-full rounded ${summary.claimRatePercent >= 75 ? "bg-green" : summary.claimRatePercent >= 40 ? "bg-amber" : "bg-pink"}`} style={{ width: `${summary.claimRatePercent}%` }} />
                        </div>
                      ) : s.grants.some((g) => g.kind === "currency") && !s.linkedIncomeSourceId ? (
                        <button onClick={() => linkIncomeSource.mutate({ game: game.config.slug, id: s.id })} className="font-mono text-[10px] text-blue text-left">
                          link income source
                        </button>
                      ) : (
                        <span className="font-mono text-[10px] text-text-faint">not tracked</span>
                      )}
                      <span className="font-mono text-right text-text-dim">{s.status === "cancelled" ? "—" : summary.renewsInDays != null ? (summary.renewsInDays <= 0 ? "today" : `${summary.renewsInDays}d`) : "—"}</span>
                      <span className="font-mono text-right text-text-dim">{fmt(summary.paidSoFarCents)}</span>
                      <span className="text-right">
                        {s.status === "active" ? (
                          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${VERDICT_CLS[summary.verdict]}`}>{summary.verdict.toUpperCase()}</span>
                        ) : (
                          <button onClick={() => cancelSub.mutate({ game: game.config.slug, id: s.id })} className="font-mono text-[9px] text-text-faint">
                            reactivate?
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {rows.length === 0 && <div className="p-3 text-xs text-text-faint">No subscriptions logged yet.</div>}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-border2 bg-green/5 flex items-center gap-3.5 font-mono text-[11px]">
              <span className="text-text-dim">MONTHLY TOTAL</span>
              <span className="text-green font-medium">{fmt(monthlyTotalCents)}</span>
              <span className="text-text-faint">{fmt(lifetimePaidCents)} paid across {rows.length}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {active.some((r) => r.summary.verdict === "cancel") && (
            <div className="bg-surface border border-pink/30 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-pink">Cancel this one</div>
              {active.filter((r) => r.summary.verdict === "cancel").slice(0, 1).map(({ game, summary }) => (
                <div key={summary.subscription.id} className="p-3 flex flex-col gap-2">
                  <div className="font-display font-bold text-sm">{summary.subscription.label}</div>
                  <div className="text-xs text-text-dim leading-relaxed">
                    {summary.claimRatePercent != null ? `Only claimed ${summary.claimRatePercent}% of periods.` : "Not tracked as claimable."} {fmt(summary.paidSoFarCents)} paid so far in {game.config.displayName}.
                  </div>
                  <button
                    onClick={() => cancelSub.mutate({ game: game.config.slug, id: summary.subscription.id })}
                    className="font-mono text-[11px] bg-pink text-[#2a0c19] py-1.5 rounded-md"
                  >
                    MARK CANCELLED
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Warnings, per game</div>
            <div className="flex flex-col">
              {data.games.map((g) => (
                <div key={g.config.slug} className="px-3 py-2 border-b border-border2 last:border-0">
                  <div className="text-xs font-semibold mb-1.5">{g.config.displayName}</div>
                  <ToggleRow label="Warn on a purchase after a lost 50/50" checked={g.settings.warnOnLost5050} onChange={(v) => updateSettings.mutate({ game: g.config.slug, body: { warnOnLost5050: v } })} />
                  <ToggleRow label="Warn if I bought here <24h ago" checked={g.settings.warnRecentPurchase} onChange={(v) => updateSettings.mutate({ game: g.config.slug, body: { warnRecentPurchase: v } })} />
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border2 font-mono text-[10px] text-text-faint leading-relaxed">This tracker can't stop a store purchase — these show up as a warning in the Add Purchase dialog, not a block.</div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">If you cancelled everything</div>
            <div className="p-3 flex flex-col gap-1.5 text-xs">
              <div className="flex"><span className="flex-1 text-text-dim">Saved per year</span><span className="font-mono text-green">${dollarsSavedPerYear.toFixed(0)}</span></div>
              <div className="flex"><span className="flex-1 text-text-dim">Pulls lost per year</span><span className="font-mono text-pink">−{pullsLostPerYear}</span></div>
            </div>
          </div>
        </div>
      </div>

      {addOpen && <AddSubscriptionDialog games={data.games} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px]">
      <button
        onClick={() => onChange(!checked)}
        className={`w-[22px] h-[13px] rounded-full flex-none p-0.5 flex ${checked ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
      >
        <span className="w-[9px] h-[9px] rounded-full bg-ink" />
      </button>
      <span className="flex-1 text-text-dim">{label}</span>
    </div>
  );
}
