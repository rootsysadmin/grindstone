import { useState } from "react";
import type { ReactNode } from "react";
import type { SpendSubscriptionCadence } from "@grindstone/shared";
import type { GameSpendData } from "./api.ts";
import { useCreateSpendSubscription, useLinkSubscriptionIncomeSource } from "./api.ts";
import { CADENCE_INTERVAL_DAYS } from "../planner/materialNeeds.ts";
import { GrantsEditor, grantsToPayload, type GrantDraft } from "./GrantsEditor.tsx";

const selectCls = "w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm";
const CADENCES: SpendSubscriptionCadence[] = ["daily", "weekly", "bi-weekly", "monthly", "one-time", "custom"];

/** A recurring real-money commitment. When it grants in-game currency it links to a real income_sources row on save — reuses the Stage 3 claim engine instead of tracking claims here too. See docs/progress.md's Stage 9 entry. */
export function AddSubscriptionDialog({ games, onClose }: { games: GameSpendData[]; onClose: () => void }) {
  const create = useCreateSpendSubscription();
  const linkIncomeSource = useLinkSubscriptionIncomeSource();
  const [gameSlug, setGameSlug] = useState(games[0]?.config.slug ?? "");
  const game = games.find((g) => g.config.slug === gameSlug) ?? null;

  const [label, setLabel] = useState("");
  const [cadence, setCadence] = useState<SpendSubscriptionCadence>("monthly");
  const [customCadenceLabel, setCustomCadenceLabel] = useState("");
  const [intervalDays, setIntervalDays] = useState<number | "">(CADENCE_INTERVAL_DAYS.monthly);
  const [priceDollars, setPriceDollars] = useState("");
  const [grants, setGrants] = useState<GrantDraft[]>([{ kind: "currency", currencyId: null, amount: "" }]);

  const priceCents = Math.round((Number(priceDollars) || 0) * 100);
  const canSubmit = game != null && label.trim().length > 0 && priceCents > 0;

  function submit() {
    if (!game || !canSubmit) return;
    const payload = grantsToPayload(grants);
    create.mutate(
      {
        game: game.config.slug,
        body: {
          label: label.trim(),
          cadence,
          customCadenceLabel: cadence === "custom" ? customCadenceLabel.trim() || null : null,
          intervalDays: cadence === "one-time" ? null : intervalDays === "" ? null : Number(intervalDays),
          priceCents,
          grants: payload,
        },
      },
      {
        onSuccess: (row: { id: number }) => {
          if (payload.some((g) => g.kind === "currency" && g.currencyId != null)) {
            linkIncomeSource.mutate({ game: game.config.slug, id: row.id });
          }
          onClose();
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[420px] max-w-full max-h-[88vh] overflow-y-auto bg-panel border border-white/10 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">New subscription</span>
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

          <Field label="Name">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Monthly Annulith pack" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Cadence">
              <select
                value={cadence}
                onChange={(e) => {
                  const c = e.target.value as SpendSubscriptionCadence;
                  setCadence(c);
                  if (c !== "one-time" && c !== "custom") setIntervalDays(CADENCE_INTERVAL_DAYS[c]);
                  else if (c === "one-time") setIntervalDays("");
                }}
                className={selectCls}
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Price ($)">
              <input type="number" min={0} step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right" />
            </Field>
          </div>

          {cadence === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cadence label">
                <input value={customCadenceLabel} onChange={(e) => setCustomCadenceLabel(e.target.value)} placeholder="e.g. per patch" className="w-full bg-white/5 border border-dashed border-white/15 rounded px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Interval (days)">
                <input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value ? Number(e.target.value) : "")} className="w-full bg-white/5 border border-dashed border-white/15 rounded px-2 py-1.5 text-sm text-right" />
              </Field>
            </div>
          )}

          <Field label="What it grants each charge">
            <GrantsEditor grants={grants} onChange={setGrants} currencies={game?.currencies ?? []} />
            {grants.some((g) => g.kind === "currency") && (
              <div className="font-mono text-[10px] text-text-faint mt-1.5">A currency reward links to a real, claimable income source — claim rate/renewal comes from claiming it on the Planner's Income Sources tab.</div>
            )}
          </Field>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2">
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CANCEL
          </button>
          <button onClick={submit} disabled={!canSubmit || create.isPending} className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40">
            + SUBSCRIPTION
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
