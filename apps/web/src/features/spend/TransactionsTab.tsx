import { useMemo, useState } from "react";
import type { PurchaseRow } from "@grindstone/shared";
import type { AllGamesSpend } from "./api.ts";
import { useDeletePurchase } from "./api.ts";
import { pullsFromGrants, centsToDollars } from "./spendData.ts";

const KIND_LABELS: Record<PurchaseRow["kind"], string> = {
  top_up: "top-up",
  battle_pass: "battle pass",
  subscription_charge: "subscription",
  one_off: "one-off",
  bundle: "bundle",
};

function fmt(cents: number): string {
  return `$${centsToDollars(cents).toFixed(2)}`;
}

function toCsv(rows: { gameName: string; purchasedAt: string; label: string; kind: string; amountCents: number; paymentMethod: string | null; isImpulse: boolean }[]): string {
  const header = "date,game,item,kind,amount,method,impulse";
  const lines = rows.map((r) =>
    [r.purchasedAt, r.gameName, r.label, r.kind, centsToDollars(r.amountCents).toFixed(2), r.paymentMethod ?? "", r.isImpulse ? "yes" : "no"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function TransactionsTab({ data }: { data: AllGamesSpend }) {
  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [impulseOnly, setImpulseOnly] = useState(false);
  const deletePurchase = useDeletePurchase();

  const rows = useMemo(() => {
    return data.games.flatMap((g) =>
      g.purchases.map((p) => ({
        purchase: p,
        gameSlug: g.config.slug,
        gameName: g.config.displayName,
        pulls: pullsFromGrants(p.grants, g.currencies),
      })),
    );
  }, [data]);

  const filtered = rows
    .filter((r) => gameFilter === "all" || r.gameSlug === gameFilter)
    .filter((r) => kindFilter === "all" || r.purchase.kind === kindFilter)
    .filter((r) => !impulseOnly || r.purchase.isImpulse)
    .filter((r) => !search.trim() || r.purchase.label.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (a.purchase.purchasedAt < b.purchase.purchasedAt ? 1 : -1));

  const shownTotalCents = filtered.reduce((a, r) => a + r.purchase.amountCents, 0);

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({
        gameName: r.gameName,
        purchasedAt: r.purchase.purchasedAt,
        label: r.purchase.label,
        kind: r.purchase.kind,
        amountCents: r.purchase.amountCents,
        paymentMethod: r.purchase.paymentMethod,
        isImpulse: r.purchase.isImpulse,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spend-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="p-2.5 flex items-center gap-2 flex-wrap border-b border-border2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`search ${rows.length} rows`}
          className="bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs font-mono w-48 outline-none focus:border-green/50"
        />
        <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono text-text-dim">
          <option value="all">GAME: ALL</option>
          {data.games.map((g) => (
            <option key={g.config.slug} value={g.config.slug}>
              {g.config.displayName}
            </option>
          ))}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono text-text-dim">
          <option value="all">KIND: ALL</option>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setImpulseOnly((v) => !v)}
          className={`text-[10px] font-mono px-2 py-1.5 rounded-md border ${impulseOnly ? "bg-pink/15 border-pink/40 text-pink" : "bg-white/5 border-white/10 text-text-dim"}`}
        >
          IMPULSE ONLY
        </button>
        <button onClick={exportCsv} className="text-[10px] font-mono px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:text-text">
          EXPORT CSV
        </button>
        <div className="flex-1" />
        <span className="font-mono text-[11px] text-text-faint">shown total</span>
        <span className="font-mono text-xs text-green">{fmt(shownTotalCents)}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[70px_120px_1fr_110px_110px_90px_80px_36px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
            <span>Date</span>
            <span>Game</span>
            <span>Item</span>
            <span>Kind</span>
            <span>Method</span>
            <span className="text-right">Amount</span>
            <span className="text-right">$/pull</span>
            <span></span>
          </div>
          <div className="flex flex-col">
            {filtered.length === 0 && <div className="p-3 text-xs text-text-faint">No transactions match.</div>}
            {filtered.map(({ purchase: p, gameName, gameSlug, pulls }) => {
              const dollarsPerPull = pulls ? centsToDollars(p.amountCents) / pulls : null;
              return (
                <div key={p.id} className={`grid grid-cols-[70px_120px_1fr_110px_110px_90px_80px_36px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs ${p.isImpulse ? "bg-pink/5" : ""}`}>
                  <span className="font-mono text-[10px] text-text-faint">{new Date(p.purchasedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                  <span className="truncate">{gameName}</span>
                  <span className="truncate">
                    {p.label}
                    {p.notes && <span className="text-text-faint text-[10px] ml-1.5">→ {p.notes}</span>}
                  </span>
                  <span className="font-mono text-[10px] text-purple">{KIND_LABELS[p.kind]}</span>
                  <span className="font-mono text-[10px] text-text-dim truncate">{p.paymentMethod ?? "—"}</span>
                  <span className="font-mono text-right font-medium">{fmt(p.amountCents)}</span>
                  <span className="font-mono text-right text-text-dim">{dollarsPerPull != null ? `$${dollarsPerPull.toFixed(2)}` : "—"}</span>
                  <button onClick={() => deletePurchase.mutate({ game: gameSlug, id: p.id })} className="text-pink/60 hover:text-pink font-mono text-[11px] text-right">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border2 bg-black/20 flex items-center gap-3.5 font-mono text-[11px] text-text-faint">
        <span>{filtered.length} of {rows.length} rows</span>
        <div className="flex-1" />
        <span>flags are yours to set · nothing is judged automatically</span>
      </div>
    </div>
  );
}
