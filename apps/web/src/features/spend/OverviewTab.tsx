import type { AllGamesSpend } from "./api.ts";
import { centsToDollars, computeGameSpendSummary, computeMonthlySpendSeries, computeSubscriptionSummary } from "./spendData.ts";

const GAME_COLORS = ["#f0b44a", "#58b7f0", "#5fd08a", "#e8639b", "#a084f5"];

function fmt(cents: number): string {
  return `$${centsToDollars(cents).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function OverviewTab({ data }: { data: AllGamesSpend }) {
  const now = new Date();
  const summaries = data.games.map((g) => computeGameSpendSummary(g, now));
  const allPurchases = data.games.flatMap((g) => g.purchases);
  const allCurrencies = data.games.flatMap((g) => g.currencies);

  const lifetimeCents = summaries.reduce((a, s) => a + s.lifetimeCents, 0);
  const thisMonthCents = summaries.reduce((a, s) => a + s.thisMonthCents, 0);

  const earliestPurchase = allPurchases.reduce<string | null>((a, p) => (!a || p.purchasedAt < a ? p.purchasedAt : a), null);
  const monthsTracked = earliestPurchase
    ? Math.max(1, Math.round((now.getTime() - new Date(earliestPurchase).getTime()) / (30 * 86400000)))
    : 1;
  const monthlyAvgCents = Math.round(lifetimeCents / monthsTracked);

  const activeSubs = data.games.flatMap((g) => g.subscriptions.filter((s) => s.status === "active" && s.cadence !== "one-time"));
  const recurringMonthlyCents = activeSubs.reduce((a, s) => a + (s.intervalDays ? Math.round(s.priceCents * (30 / s.intervalDays)) : s.priceCents), 0);

  const totalSRanks = summaries.reduce((a, s) => a + s.sRanks, 0);
  const dollarsPerSRank = totalSRanks > 0 ? centsToDollars(lifetimeCents) / totalSRanks : null;

  const monthly = computeMonthlySpendSeries(data.games, 12, now);
  const maxMonth = Math.max(1, ...monthly.map((m) => m.totalCents));

  const monthlyCap = data.budgets.find((b) => b.kind === "monthly_cap" && b.gameId === null && b.enabled);

  const recentPurchases = [...allPurchases].sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1)).slice(0, 5);

  const renewingSoon = data.games
    .flatMap((g) => g.subscriptions.filter((s) => s.status === "active").map((s) => ({ game: g, summary: computeSubscriptionSummary(s, g.purchases, g.currencies, null, [], null, now) })))
    .filter((r) => r.summary.renewsInDays != null)
    .sort((a, b) => (a.summary.renewsInDays ?? 0) - (b.summary.renewsInDays ?? 0))
    .slice(0, 5);

  const pullsFundedTotal = summaries.reduce((a, s) => a + s.pullsFunded, 0);
  const impulsePurchases = allPurchases.filter((p) => p.isImpulse);
  const impulseCents = impulsePurchases.reduce((a, p) => a + p.amountCents, 0);
  const subscriptionSpendCents = allPurchases.filter((p) => p.subscriptionId != null).reduce((a, p) => a + p.amountCents, 0);
  const subsSharePercent = lifetimeCents > 0 ? Math.round((subscriptionSpendCents / lifetimeCents) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Tile label="LIFETIME" value={fmt(lifetimeCents)} accent="green" sub={earliestPurchase ? `since ${new Date(earliestPurchase).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "no purchases yet"} />
        <Tile label="THIS MONTH" value={fmt(thisMonthCents)} sub={monthlyCap ? `of ${fmt(monthlyCap.capCents)} cap` : undefined} />
        <Tile label="MONTHLY AVG" value={fmt(monthlyAvgCents)} sub={`$${Math.round(centsToDollars(monthlyAvgCents) * 12)} / year at this rate`} />
        <Tile label="RECURRING" value={fmt(recurringMonthlyCents)} accent="purple" sub={`/ month · ${activeSubs.length} subscription${activeSubs.length === 1 ? "" : "s"}`} />
        <Tile label="$ / S-RANK" value={dollarsPerSRank != null ? `$${dollarsPerSRank.toFixed(0)}` : "—"} accent="amber" sub={`${totalSRanks} pulled across ${summaries.length} games`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_356px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">By game · lifetime</span>
              <span className="font-mono text-[10px] text-text-faint">value columns use each game's own pull cost</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[26px_1fr_90px_120px_80px_80px_90px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  <span></span>
                  <span>Game</span>
                  <span className="text-right">Lifetime</span>
                  <span>Share</span>
                  <span className="text-right">Pulls</span>
                  <span className="text-right">$/pull</span>
                  <span className="text-right">Status</span>
                </div>
                {summaries.map((s, i) => (
                  <div key={s.gameId} className="grid grid-cols-[26px_1fr_90px_120px_80px_80px_90px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <span className="w-[18px] h-[18px] rounded" style={{ background: GAME_COLORS[i % GAME_COLORS.length] }} />
                    <span className="font-semibold">{s.displayName}</span>
                    <span className="font-mono text-right" style={{ color: GAME_COLORS[i % GAME_COLORS.length] }}>{fmt(s.lifetimeCents)}</span>
                    <div className="h-1.5 rounded bg-white/10">
                      <div className="h-full rounded" style={{ width: `${lifetimeCents > 0 ? Math.round((s.lifetimeCents / lifetimeCents) * 100) : 0}%`, background: GAME_COLORS[i % GAME_COLORS.length] }} />
                    </div>
                    <span className="font-mono text-text-dim text-right">{s.pullsFunded}</span>
                    <span className="font-mono text-text-dim text-right">{s.dollarsPerPull != null ? `$${s.dollarsPerPull.toFixed(2)}` : "—"}</span>
                    <span className={`font-mono text-right ${s.status.kind === "active" ? "text-green" : s.status.kind === "quit" ? "text-pink" : "text-amber"}`}>
                      {s.status.kind === "active" ? "active" : s.status.kind === "no-spend" ? "no spend" : `${s.status.kind} ${s.status.sinceMonth}`}
                    </span>
                  </div>
                ))}
                {summaries.length === 0 && <div className="p-3 text-xs text-text-faint">No games configured.</div>}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-border2 bg-green/5 flex items-center gap-3.5 font-mono text-[11px]">
              <span className="text-text-dim">TOTAL</span>
              <span className="text-green font-medium">{fmt(lifetimeCents)}</span>
              <span className="text-text-faint">{pullsFundedTotal} pulls funded</span>
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Monthly spend · 12 months</span>
              {monthlyCap && <span className="font-mono text-[10px] text-text-faint">dashed line = {fmt(monthlyCap.capCents)} cap</span>}
            </div>
            <div className="p-3 relative">
              {monthlyCap && (
                <div
                  className="absolute left-3 right-3 border-t border-dashed border-pink/40"
                  style={{ top: `${12 + (1 - Math.min(1, monthlyCap.capCents / maxMonth)) * 88}px` }}
                />
              )}
              <div className="flex items-end gap-1 h-[100px]">
                {monthly.map((m) => (
                  <div key={m.monthKey} className="flex-1 h-full flex flex-col justify-end rounded-t overflow-hidden" title={`${m.label}: ${fmt(m.totalCents)}`}>
                    {data.games.map((g, i) => {
                      const cents = m.byGame[g.config.slug] ?? 0;
                      if (cents <= 0) return null;
                      const heightPercent = Math.max(2, Math.round((cents / maxMonth) * 100));
                      return <div key={g.config.slug} style={{ flex: `0 0 ${heightPercent}%`, background: GAME_COLORS[i % GAME_COLORS.length] }} />;
                    })}
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[9px] text-text-faint mt-1.5">
                <span>{monthly[0]?.label}</span>
                <span>{monthly[monthly.length - 1]?.label} · to date</span>
              </div>
              <div className="flex gap-3 mt-2 font-mono text-[10px] text-text-dim flex-wrap">
                {data.games.map((g, i) => (
                  <span key={g.config.slug} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-sm" style={{ background: GAME_COLORS[i % GAME_COLORS.length] }} />
                    {g.config.displayName}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Recent purchases</div>
            <div className="flex flex-col">
              {recentPurchases.length === 0 && <div className="p-3 text-xs text-text-faint">No purchases logged yet.</div>}
              {recentPurchases.map((p) => {
                const game = data.games.find((g) => g.purchases.includes(p));
                return (
                  <div key={p.id} className="grid grid-cols-[64px_1fr_100px_80px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <span className="font-mono text-[10px] text-text-faint">{new Date(p.purchasedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                    <span className="truncate">
                      {p.label}
                      {p.isImpulse && <span className="font-mono text-[9px] text-pink ml-1.5">IMPULSE</span>}
                    </span>
                    <span className="font-mono text-[10px] text-text-faint truncate">{game?.config.displayName}</span>
                    <span className="font-mono text-right font-medium">{fmt(p.amountCents)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {monthlyCap && (
            <div className={`bg-surface border rounded-lg overflow-hidden ${thisMonthCents > monthlyCap.capCents ? "border-pink/30" : "border-border2"}`}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
                <span className={`font-mono text-[10px] uppercase tracking-wide ${thisMonthCents > monthlyCap.capCents ? "text-pink" : "text-text-dim"}`}>This month's budget</span>
              </div>
              <div className="p-3 flex flex-col gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display font-bold text-2xl">{fmt(thisMonthCents)}</span>
                  <span className="font-mono text-xs text-text-faint">of {fmt(monthlyCap.capCents)}</span>
                  {thisMonthCents > monthlyCap.capCents && <span className="ml-auto font-mono text-[11px] text-pink">over by {fmt(thisMonthCents - monthlyCap.capCents)}</span>}
                </div>
                <div className="h-2 rounded bg-white/10 overflow-hidden">
                  <div className={`h-full ${thisMonthCents > monthlyCap.capCents ? "bg-pink" : "bg-green"}`} style={{ width: `${Math.min(100, Math.round((thisMonthCents / monthlyCap.capCents) * 100))}%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Renewing soon</span>
            </div>
            <div className="flex flex-col">
              {renewingSoon.length === 0 && <div className="p-3 text-xs text-text-faint">No active subscriptions.</div>}
              {renewingSoon.map(({ game, summary }) => (
                <div key={summary.subscription.id} className="grid grid-cols-[1fr_64px_60px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <span className="truncate">
                    {summary.subscription.label}
                    <span className="text-text-faint"> · {game.config.displayName}</span>
                  </span>
                  <span className="font-mono text-right">{fmt(summary.subscription.priceCents)}</span>
                  <span className="font-mono text-right text-text-faint">{summary.renewsInDays! <= 0 ? "today" : `${summary.renewsInDays}d`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">What the money bought</div>
            <div className="p-3 grid grid-cols-2 gap-2.5">
              <MiniStat label="PULLS FUNDED" value={String(pullsFundedTotal)} />
              <MiniStat label="S-RANKS" value={String(totalSRanks)} accent="amber" />
              <MiniStat label="SUBS SHARE" value={`${subsSharePercent}%`} accent="purple" />
              <MiniStat label="IMPULSE BUYS" value={String(impulsePurchases.length)} sub={fmt(impulseCents)} accent="pink" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "green" | "purple" | "amber" }) {
  const color = accent === "green" ? "text-green" : accent === "purple" ? "text-purple" : accent === "amber" ? "text-amber" : "";
  const border = accent === "green" ? "border-green/28" : accent === "amber" ? "border-amber/25" : "border-border2";
  return (
    <div className={`bg-surface border ${border} rounded-lg p-2.5`}>
      <div className="font-mono text-[9px] tracking-wide text-text-faint mb-1">{label}</div>
      <div className={`font-display font-bold text-xl leading-none ${color}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-text-faint mt-1">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "amber" | "purple" | "pink" }) {
  const color = accent === "amber" ? "text-amber" : accent === "purple" ? "text-purple" : accent === "pink" ? "text-pink" : "";
  return (
    <div>
      <div className="font-mono text-[9px] text-text-faint">{label}</div>
      <div className={`font-display font-bold text-lg ${color}`}>{value}</div>
      {sub && <div className="font-mono text-[9px] text-text-faint">{sub}</div>}
    </div>
  );
}
