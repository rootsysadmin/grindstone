import { useState } from "react";
import type { SpendBudgetRow } from "@grindstone/shared";
import type { AllGamesSpend } from "./api.ts";
import { useCreateSpendBudget, useCreateSpendBudgetOverride, useDeleteSpendBudget, useUpdateSpendBudget } from "./api.ts";
import { centsToDollars, computeBudgetStatus, computeBudgetSuggestion, computeMonthlySpendSeries } from "./spendData.ts";

function fmt(cents: number): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

export function BudgetTab({ data }: { data: AllGamesSpend }) {
  const createBudget = useCreateSpendBudget();
  const updateBudget = useUpdateSpendBudget();
  const deleteBudget = useDeleteSpendBudget();
  const createOverride = useCreateSpendBudgetOverride();
  const [newCapGame, setNewCapGame] = useState<string>("");
  const [newCapDollars, setNewCapDollars] = useState("");

  const now = new Date();
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthly = computeMonthlySpendSeries(data.games, 12, now);
  const thisMonth = monthly[monthly.length - 1];

  const platformCap = data.budgets.find((b) => b.kind === "monthly_cap" && b.gameId === null);
  const singlePurchaseCeiling = data.budgets.find((b) => b.kind === "single_purchase_ceiling");
  const gameCaps = data.budgets.filter((b) => b.kind === "monthly_cap" && b.gameId !== null);

  const platformStatus = platformCap ? computeBudgetStatus(platformCap.capCents, thisMonth?.totalCents ?? 0) : null;
  const suggestion = platformCap ? computeBudgetSuggestion(monthly, platformCap.capCents) : null;

  const maxMonth = Math.max(1, ...monthly.map((m) => m.totalCents));
  const overBudgetMonths = platformCap ? monthly.filter((m) => m.totalCents > platformCap.capCents).length : 0;

  return (
    <div className="flex flex-col gap-3">
      {platformCap && platformStatus ? (
        <div className={`bg-surface border rounded-lg p-3 grid grid-cols-1 md:grid-cols-[190px_1fr_230px] gap-4 items-center ${platformStatus.breached ? "border-pink/28" : "border-border2"}`}>
          <div>
            <div className="font-mono text-[9px] tracking-wide text-text-faint mb-1">{now.toLocaleDateString("en-US", { month: "long" }).toUpperCase()}</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-display font-bold text-3xl leading-none ${platformStatus.breached ? "text-pink" : ""}`}>{fmt(platformStatus.spentCents)}</span>
              <span className="font-mono text-xs text-text-faint">/ {fmt(platformStatus.capCents)}</span>
            </div>
            {platformStatus.breached && <div className="font-mono text-[10px] text-pink mt-1">over by {fmt(platformStatus.spentCents - platformStatus.capCents)}</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 rounded bg-white/10 overflow-hidden">
              <div className={`h-full ${platformStatus.breached ? "bg-pink" : "bg-purple"}`} style={{ width: `${Math.min(100, platformStatus.usedPercent)}%` }} />
            </div>
            <div className="text-xs text-text-dim">{platformStatus.usedPercent}% of the monthly cap used.</div>
          </div>
          {suggestion && (
            <button
              onClick={() => updateBudget.mutate({ game: data.games[0]!.config.slug, id: platformCap.id, body: { capCents: suggestion.suggestedCapCents } })}
              className="text-xs font-mono bg-white/5 border border-white/10 text-text-dim py-2 rounded-md"
            >
              RAISE CAP TO {fmt(suggestion.suggestedCapCents)}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border2 rounded-lg p-3 text-xs text-text-faint">No platform-wide monthly cap set yet — add one below.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_356px] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Caps</span>
              <span className="font-mono text-[10px] text-text-faint">advisory only — nothing here can block a store purchase</span>
            </div>
            <div className="flex flex-col">
              {platformCap && <CapRow label="All games · monthly" cap={platformCap} spentCents={thisMonth?.totalCents ?? 0} onDelete={() => deleteBudget.mutate({ game: data.games[0]!.config.slug, id: platformCap.id })} />}
              {gameCaps.map((cap) => {
                const game = data.games.find((g) => g.config.slug === cap.gameId);
                const spentCents = game?.purchases.filter((p) => p.purchasedAt.slice(0, 7) === nowMonth).reduce((a, p) => a + p.amountCents, 0) ?? 0;
                return <CapRow key={cap.id} label={game?.config.displayName ?? cap.gameId ?? "—"} cap={cap} spentCents={spentCents} onDelete={() => deleteBudget.mutate({ game: cap.gameId!, id: cap.id })} />;
              })}
              {singlePurchaseCeiling && (
                <CapRow label="Single purchase ceiling" cap={singlePurchaseCeiling} spentCents={0} onDelete={() => deleteBudget.mutate({ game: data.games[0]!.config.slug, id: singlePurchaseCeiling.id })} noSpend />
              )}
              {data.budgets.length === 0 && <div className="p-3 text-xs text-text-faint">No caps configured.</div>}
            </div>
            <div className="p-2.5 border-t border-border2 flex items-center gap-2 flex-wrap">
              <select value={newCapGame} onChange={(e) => setNewCapGame(e.target.value)} className="bg-surface border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono">
                <option value="">All games (platform)</option>
                {data.games.map((g) => (
                  <option key={g.config.slug} value={g.config.slug}>
                    {g.config.displayName}
                  </option>
                ))}
                <option value="__single__">Single purchase ceiling</option>
              </select>
              <input value={newCapDollars} onChange={(e) => setNewCapDollars(e.target.value)} placeholder="$ amount" type="number" min={0} className="bg-surface border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono w-24" />
              <button
                onClick={() => {
                  const cents = Math.round(Number(newCapDollars) * 100);
                  if (!cents) return;
                  const game = newCapGame && newCapGame !== "__single__" ? newCapGame : data.games[0]!.config.slug;
                  createBudget.mutate({
                    game,
                    body: {
                      gameId: newCapGame === "__single__" || newCapGame === "" ? null : newCapGame,
                      kind: newCapGame === "__single__" ? "single_purchase_ceiling" : "monthly_cap",
                      capCents: cents,
                      action: "warn",
                    },
                  });
                  setNewCapDollars("");
                }}
                className="text-[11px] font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium"
              >
                + ADD CAP
              </button>
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Cap vs. actual · 12 months</span>
              {overBudgetMonths > 0 && <span className="font-mono text-[10px] text-text-faint">{overBudgetMonths} months over</span>}
            </div>
            <div className="p-3 relative">
              {platformCap && (
                <div className="absolute left-3 right-3 border-t border-dashed border-pink/45" style={{ top: `${12 + (1 - Math.min(1, platformCap.capCents / maxMonth)) * 88}px` }} />
              )}
              <div className="flex items-stretch gap-1.5 h-[88px]">
                {monthly.map((m) => (
                  <div key={m.monthKey} className="flex-1 flex flex-col justify-end" title={`${m.label}: ${fmt(m.totalCents)}`}>
                    <div className={`rounded-t ${platformCap && m.totalCents > platformCap.capCents ? "bg-pink" : "bg-green"}`} style={{ height: `${Math.max(2, Math.round((m.totalCents / maxMonth) * 100))}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[9px] text-text-faint mt-1.5">
                <span>{monthly[0]?.label}</span>
                {platformCap && <span className="text-pink/70">dashed = {fmt(platformCap.capCents)} cap (current)</span>}
                <span>{monthly[monthly.length - 1]?.label}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {singlePurchaseCeiling && (
            <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Guardrail</div>
              <div className="flex items-center gap-2 px-3 py-2.5 text-[11px]">
                <button
                  onClick={() => updateBudget.mutate({ game: data.games[0]!.config.slug, id: singlePurchaseCeiling.id, body: { enabled: !singlePurchaseCeiling.enabled } })}
                  className={`w-[22px] h-[13px] rounded-full flex-none p-0.5 flex ${singlePurchaseCeiling.enabled ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
                >
                  <span className="w-[9px] h-[9px] rounded-full bg-ink" />
                </button>
                <span className="flex-1">Confirm twice above {fmt(singlePurchaseCeiling.capCents)}</span>
              </div>
              <div className="px-3 py-2 border-t border-border2 font-mono text-[10px] text-text-faint leading-relaxed">
                Enforced in the Add Purchase dialog. The lost-50/50 and recent-purchase warnings live per game on the Subscriptions tab.
              </div>
            </div>
          )}

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Breach log</div>
            <div className="flex flex-col text-xs">
              {data.budgetOverrides.length === 0 && <div className="p-3 text-text-faint">No overrides logged.</div>}
              {[...data.budgetOverrides]
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 8)
                .map((o) => (
                  <div key={o.id} className="flex gap-2 px-3 py-1.5 border-b border-border2 last:border-0">
                    <span className="font-mono text-[10px] text-text-faint w-14 flex-none">{new Date(o.createdAt * 1000).toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                    <span className="flex-1 text-text-dim">{o.note ?? "cap overridden"}</span>
                  </div>
                ))}
            </div>
          </div>

          {suggestion && (
            <div className="bg-surface border border-amber/28 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-amber">Suggestion</div>
              <div className="p-3 text-xs text-text-dim leading-relaxed">
                {suggestion.breachCount} of the last {monthly.length} months went over the current cap. A ${centsToDollars(suggestion.suggestedCapCents).toFixed(0)} cap matches what you actually spend.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapRow({ label, cap, spentCents, onDelete, noSpend }: { label: string; cap: SpendBudgetRow; spentCents: number; onDelete: () => void; noSpend?: boolean }) {
  const status = computeBudgetStatus(cap.capCents, spentCents);
  return (
    <div className={`grid grid-cols-[26px_1fr_80px_80px_150px_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs ${status.breached ? "bg-pink/5" : ""}`}>
      <span className="w-[18px] h-[18px] rounded bg-white/10 border border-white/16" />
      <span className="font-semibold">{label}</span>
      <span className="font-mono text-right">{fmt(cap.capCents)}</span>
      <span className={`font-mono text-right ${status.breached ? "text-pink" : "text-text-dim"}`}>{noSpend ? "—" : fmt(spentCents)}</span>
      {noSpend ? (
        <span className="font-mono text-[10px] text-text-faint">confirm twice on entry</span>
      ) : (
        <div className="h-1.5 rounded bg-white/10">
          <div className={`h-full rounded ${status.breached ? "bg-pink" : "bg-amber"}`} style={{ width: `${Math.min(100, status.usedPercent)}%` }} />
        </div>
      )}
      <button onClick={onDelete} className="text-pink/60 hover:text-pink font-mono text-[11px] text-right">
        ✕
      </button>
    </div>
  );
}
