import type { AllGamesSpend } from "./api.ts";
import { centsToDollars, computeGameSpendSummary, computeTheOneChange, computeValueByType, pullsFromGrants } from "./spendData.ts";

function fmt(cents: number): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

const GAME_COLORS = ["#f0b44a", "#58b7f0", "#5fd08a", "#e8639b", "#a084f5"];

export function ValueTab({ data }: { data: AllGamesSpend }) {
  const allPurchases = data.games.flatMap((g) => g.purchases.map((p) => ({ p, currencies: g.currencies })));
  const withPulls = allPurchases
    .map(({ p, currencies }) => ({ p, pulls: pullsFromGrants(p.grants, currencies) }))
    .filter((r) => r.pulls > 0)
    .map((r) => ({ ...r, dollarsPerPull: centsToDollars(r.p.amountCents) / r.pulls }));

  const totalSpentCents = data.games.flatMap((g) => g.purchases).reduce((a, p) => a + p.amountCents, 0);
  const totalPullsFunded = withPulls.reduce((a, r) => a + r.pulls, 0);
  const blended = totalPullsFunded > 0 ? centsToDollars(totalSpentCents) / totalPullsFunded : null;

  const byRate = [...withPulls].sort((a, b) => a.dollarsPerPull - b.dollarsPerPull);
  const best = byRate[0];
  const worst = byRate[byRate.length - 1];
  const repeatable = byRate.filter((r) => r.p.kind === "battle_pass" || r.p.kind === "subscription_charge");
  const repeatableBest = repeatable[0];

  const byType = computeValueByType(data.games.flatMap((g) => g.purchases), data.games.flatMap((g) => g.currencies));
  const oneChange = computeTheOneChange(byType, blended);

  const summaries = data.games.map((g) => computeGameSpendSummary(g));
  const totalPullsAll = data.games.reduce((a, g) => a + g.pullLog.reduce((b, p) => b + p.quantity, 0), 0);
  const paidPulls = summaries.reduce((a, s) => a + s.pullsFunded, 0);
  const freePulls = Math.max(0, totalPullsAll - paidPulls);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <ValueTile label="BEST VALUE" value={best ? `$${best.dollarsPerPull.toFixed(2)} / pull` : "—"} sub={best ? `${best.p.label} · once only` : "no data yet"} accent="green" />
        <ValueTile label="REPEATABLE BEST" value={repeatableBest ? `$${repeatableBest.dollarsPerPull.toFixed(2)} / pull` : "—"} sub={repeatableBest ? repeatableBest.p.label : "no passes/subs logged"} accent="amber" />
        <ValueTile label="WORST VALUE" value={worst ? `$${worst.dollarsPerPull.toFixed(2)} / pull` : "—"} sub={worst && best ? `${(worst.dollarsPerPull / best.dollarsPerPull).toFixed(1)}× the best` : "no data yet"} accent="pink" />
        <ValueTile label="BLENDED" value={blended != null ? `$${blended.toFixed(2)} / pull` : "—"} sub="across every purchase" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_356px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">By purchase type</span>
              <span className="font-mono text-[10px] text-text-faint">lifetime, all games</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[1fr_96px_70px_80px_140px_90px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  <span>Type</span>
                  <span className="text-right">Spent</span>
                  <span className="text-right">Buys</span>
                  <span className="text-right">Pulls</span>
                  <span>$/pull</span>
                  <span className="text-right">vs. blended</span>
                </div>
                {byType.map((t) => {
                  const diff = blended != null && t.dollarsPerPull != null ? Math.round(((t.dollarsPerPull - blended) / blended) * 100) : null;
                  return (
                    <div key={t.kind} className="grid grid-cols-[1fr_96px_70px_80px_140px_90px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                      <span>{t.kind}</span>
                      <span className="font-mono text-right">{fmt(t.spentCents)}</span>
                      <span className="font-mono text-right text-text-dim">{t.buys}</span>
                      <span className="font-mono text-right text-text-dim">{t.pulls}</span>
                      <span className={`font-mono ${t.dollarsPerPull != null && best && t.dollarsPerPull <= best.dollarsPerPull * 1.05 ? "text-green" : "text-text-dim"}`}>{t.dollarsPerPull != null ? `$${t.dollarsPerPull.toFixed(2)}` : "—"}</span>
                      <span className={`font-mono text-right ${diff == null ? "text-text-faint" : diff <= 0 ? "text-green" : "text-pink"}`}>{diff != null ? `${diff > 0 ? "+" : ""}${diff}%` : "—"}</span>
                    </div>
                  );
                })}
                {byType.length === 0 && <div className="p-3 text-xs text-text-faint">No purchases logged yet.</div>}
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Cost per S-rank · by game</span>
              <span className="font-mono text-[10px] text-text-faint">blended — not paid-pulls-only, see caveat</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[26px_1fr_90px_90px_1fr] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
                  <span></span>
                  <span>Game</span>
                  <span className="text-right">Spent</span>
                  <span className="text-right">S-ranks</span>
                  <span>$/S-rank</span>
                </div>
                {summaries.map((s, i) => (
                  <div key={s.gameId} className="grid grid-cols-[26px_1fr_90px_90px_1fr] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <span className="w-[18px] h-[18px] rounded" style={{ background: GAME_COLORS[i % GAME_COLORS.length] }} />
                    <span>{s.displayName}</span>
                    <span className="font-mono text-right">{fmt(s.lifetimeCents)}</span>
                    <span className="font-mono text-right text-text-dim">{s.sRanks}</span>
                    <span className="font-mono">{s.dollarsPerSRank != null ? `$${s.dollarsPerSRank.toFixed(0)}` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {oneChange && (
            <div className="bg-surface border border-green/30 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-green">The one change</div>
              <div className="p-3 flex flex-col gap-2">
                <div className="font-display font-bold text-sm">Stop buying {oneChange.worst.kind.toLowerCase()}.</div>
                <div className="text-xs text-text-dim leading-relaxed">
                  {fmt(oneChange.worst.spentCents)} across {oneChange.worst.buys} purchases bought {oneChange.worst.pulls} pulls. The same money elsewhere would buy {oneChange.worst.pulls + oneChange.pullsForgone}.
                </div>
                <div className="flex flex-col gap-1 font-mono text-[11px] text-text-dim">
                  <span className="flex"><span className="flex-1">Pulls forgone</span><span className="text-pink">−{oneChange.pullsForgone}</span></span>
                  {oneChange.blendedIfSkipped != null && <span className="flex"><span className="flex-1">Blended rate would be</span><span className="text-green">${oneChange.blendedIfSkipped.toFixed(2)}</span></span>}
                </div>
              </div>
            </div>
          )}

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Paid vs. free</div>
            <div className="p-3 flex flex-col gap-2">
              <div className="h-3 rounded bg-white/10 flex overflow-hidden">
                <div style={{ width: `${totalPullsAll > 0 ? Math.round((paidPulls / totalPullsAll) * 100) : 0}%`, background: "#f0b44a" }} />
                <div style={{ width: `${totalPullsAll > 0 ? Math.round((freePulls / totalPullsAll) * 100) : 0}%`, background: "#5fd08a" }} />
              </div>
              <div className="flex flex-col gap-1 font-mono text-[11px] text-text-dim">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-amber" /><span className="flex-1">Paid pulls</span>{paidPulls}</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm bg-green" /><span className="flex-1">Free pulls</span>{freePulls}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Caveat</div>
            <div className="p-3 text-xs text-text-dim leading-relaxed">
              Value here is pulls per dollar only, blended across every pull ever logged — it doesn't isolate which specific pulls a purchase funded, and says nothing about whether a character was worth pulling.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: "green" | "amber" | "pink" }) {
  const color = accent === "green" ? "text-green" : accent === "amber" ? "text-amber" : accent === "pink" ? "text-pink" : "";
  return (
    <div className="bg-surface border border-border2 rounded-lg p-2.5">
      <div className="font-mono text-[9px] tracking-wide text-text-faint mb-1">{label}</div>
      <div className={`font-display font-bold text-lg leading-tight ${color}`}>{value}</div>
      <div className="font-mono text-[10px] text-text-faint mt-1">{sub}</div>
    </div>
  );
}
