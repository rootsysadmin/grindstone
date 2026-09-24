import type { GrantKind, MasterDataRow } from "@grindstone/shared";

/** Draft shape used only while editing in a dialog — `amount` stays a string until submit so a half-typed number doesn't get clamped mid-keystroke. */
export interface GrantDraft {
  kind: GrantKind;
  currencyId: number | null;
  amount: string;
}

export function grantsToPayload(grants: GrantDraft[]): { kind: GrantKind; currencyId: number | null; amount: number }[] {
  return grants
    .filter((g) => (Number(g.amount) || 0) > 0 && (g.kind === "pulls" || g.currencyId != null))
    .map((g) => ({ kind: g.kind, currencyId: g.kind === "currency" ? g.currencyId : null, amount: Math.max(0, Number(g.amount) || 0) }));
}

/**
 * A purchase or subscription can grant more than one thing at once — most
 * commonly a battle pass granting both in-game currency and a direct pull
 * count. Shared between AddPurchaseDialog and AddSubscriptionDialog rather
 * than duplicated, since it's the exact same "add as many rewards as
 * apply" editor in both.
 */
export function GrantsEditor({ grants, onChange, currencies }: { grants: GrantDraft[]; onChange: (next: GrantDraft[]) => void; currencies: MasterDataRow[] }) {
  function update(i: number, patch: Partial<GrantDraft>) {
    onChange(grants.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function remove(i: number) {
    onChange(grants.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {grants.map((g, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <select
            value={g.kind}
            onChange={(e) => update(i, { kind: e.target.value as GrantKind, currencyId: null })}
            className="w-[100px] flex-none bg-surface border border-white/10 rounded px-1.5 py-1.5 text-[10px] font-mono"
          >
            <option value="currency">CURRENCY</option>
            <option value="pulls">PULLS</option>
          </select>
          {g.kind === "currency" ? (
            <select value={g.currencyId ?? ""} onChange={(e) => update(i, { currencyId: Number(e.target.value) })} className="flex-1 min-w-0 bg-surface border border-white/10 rounded px-2 py-1.5 text-sm">
              <option value="" disabled>
                Select currency…
              </option>
              {currencies.map((c) => (
                <option key={c.id as number} value={c.id as number}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex-1 min-w-0 font-mono text-[11px] text-text-faint px-1">pull count</div>
          )}
          <input
            type="number"
            min={0}
            value={g.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            placeholder="qty"
            className="w-[76px] flex-none bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
          />
          <button onClick={() => remove(i)} className="flex-none text-pink/60 hover:text-pink font-mono text-xs px-1">
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...grants, { kind: "currency", currencyId: null, amount: "" }])}
        className="text-left text-[11px] font-mono text-text-faint border border-dashed border-white/10 rounded px-2 py-1.5"
      >
        + add reward
      </button>
    </div>
  );
}
