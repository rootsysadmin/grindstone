import { useState } from "react";
import type { ReactNode } from "react";
import type { PurchaseKind, SpendBudgetRow } from "@grindstone/shared";
import type { GameSpendData } from "./api.ts";
import { useCreatePurchase } from "./api.ts";
import { GrantsEditor, grantsToPayload, type GrantDraft } from "./GrantsEditor.tsx";

const selectCls = "w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm";
const KIND_OPTIONS: PurchaseKind[] = ["top_up", "battle_pass", "subscription_charge", "one_off", "bundle"];
const KIND_LABELS: Record<PurchaseKind, string> = {
  top_up: "Top-up",
  battle_pass: "Battle pass",
  subscription_charge: "Subscription charge",
  one_off: "One-off",
  bundle: "Bundle",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Screen 09-style "+ PURCHASE" dialog — the one dialog in the app that has
 * to ask which game, since Spend isn't scoped to one active game like
 * everywhere else. Carries the two real, enforceable guardrails from
 * docs/progress.md: a live warning when a lost 50/50 or another purchase
 * happened very recently in this game, and an actual double-confirm step
 * when the amount exceeds the single-purchase ceiling.
 */
export function AddPurchaseDialog({ games, budgets, onClose }: { games: GameSpendData[]; budgets: SpendBudgetRow[]; onClose: () => void }) {
  const create = useCreatePurchase();
  const [gameSlug, setGameSlug] = useState(games[0]?.config.slug ?? "");
  const game = games.find((g) => g.config.slug === gameSlug) ?? null;

  const [purchasedAt, setPurchasedAt] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<PurchaseKind>("top_up");
  const [amountDollars, setAmountDollars] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [grants, setGrants] = useState<GrantDraft[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [isImpulse, setIsImpulse] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmedOverCeiling, setConfirmedOverCeiling] = useState(false);

  const amountCents = Math.round((Number(amountDollars) || 0) * 100);
  const ceiling = budgets.find((b) => b.kind === "single_purchase_ceiling" && b.enabled);
  const overCeiling = ceiling != null && amountCents > ceiling.capCents;

  const lostRecently = game?.settings.warnOnLost5050
    ? game.pullLog.some((p) => p.fiftyFiftyResult === "lost" && Date.now() - new Date(p.pulledAt).getTime() < 86400000)
    : false;
  const lastPurchase = game && game.purchases.length > 0 ? game.purchases.reduce((a, p) => (p.purchasedAt > a ? p.purchasedAt : a), game.purchases[0]!.purchasedAt) : null;
  const purchasedRecently = game?.settings.warnRecentPurchase && lastPurchase ? Date.now() - new Date(lastPurchase).getTime() < 86400000 : false;

  const canSubmit = game != null && label.trim().length > 0 && amountCents > 0 && (!overCeiling || confirmedOverCeiling);

  function submit() {
    if (!game || !canSubmit) return;
    create.mutate(
      {
        game: game.config.slug,
        body: {
          purchasedAt,
          label: label.trim(),
          kind,
          amountCents,
          paymentMethod: paymentMethod.trim() || null,
          grants: grantsToPayload(grants),
          isImpulse,
          notes: notes.trim() || null,
          subscriptionId: kind === "subscription_charge" ? subscriptionId : null,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[440px] max-w-full max-h-[88vh] overflow-y-auto bg-panel border border-white/10 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">Log a purchase</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Game">
            <select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} className={selectCls}>
              {games.map((g) => (
                <option key={g.config.slug} value={g.config.slug}>
                  {g.config.displayName}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Date">
              <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Amount ($)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amountDollars}
                onChange={(e) => {
                  setAmountDollars(e.target.value);
                  setConfirmedOverCeiling(false);
                }}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
              />
            </Field>
          </div>

          <Field label="Item">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Monthly Annulith pack" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Kind">
              <select value={kind} onChange={(e) => setKind(e.target.value as PurchaseKind)} className={selectCls}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method (optional)">
              <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="e.g. Visa ·6614" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
            </Field>
          </div>

          {kind === "subscription_charge" && game && (
            <Field label="Part of subscription (optional)">
              <select value={subscriptionId ?? ""} onChange={(e) => setSubscriptionId(e.target.value ? Number(e.target.value) : null)} className={selectCls}>
                <option value="">not linked</option>
                {game.subscriptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="What it granted (optional — add as many as apply)">
            <GrantsEditor grants={grants} onChange={setGrants} currencies={game?.currencies ?? []} />
          </Field>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isImpulse} onChange={(e) => setIsImpulse(e.target.checked)} />
            Impulse buy — flags are yours to set, nothing is judged automatically
          </label>

          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm resize-none" />
          </Field>

          {lostRecently && (
            <div className="bg-pink/8 border border-pink/28 rounded-md px-3 py-2 text-xs text-pink leading-relaxed">You lost a 50/50 in this game in the last 24h.</div>
          )}
          {purchasedRecently && (
            <div className="bg-amber/8 border border-amber/28 rounded-md px-3 py-2 text-xs text-amber leading-relaxed">You logged a purchase in this game less than 24h ago.</div>
          )}
          {overCeiling && ceiling && (
            <div className="bg-pink/10 border border-pink/35 rounded-md px-3 py-2 flex flex-col gap-2">
              <span className="text-xs text-pink leading-relaxed">
                This is above your ${(ceiling.capCents / 100).toFixed(2)} single-purchase ceiling. Confirm you want to log it anyway.
              </span>
              <label className="flex items-center gap-2 text-xs text-pink">
                <input type="checkbox" checked={confirmedOverCeiling} onChange={(e) => setConfirmedOverCeiling(e.target.checked)} />
                Yes, log it anyway
              </label>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2">
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CANCEL
          </button>
          <button onClick={submit} disabled={!canSubmit || create.isPending} className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40">
            LOG PURCHASE
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
