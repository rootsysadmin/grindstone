import type { MasterDataRow, RewardDraft } from "@grindstone/shared";

/** Draft shape used only while editing — `quantity` stays a string until submit so a half-typed number doesn't get clamped mid-keystroke. */
export interface RewardEditDraft {
  kind: "currency" | "material";
  ref: string | null; // the picked row's slug — RewardDraft is always slug-based, never a raw id, see packages/shared/src/sync.ts
  quantity: string;
}

export function rewardsToPayload(rewards: RewardEditDraft[]): RewardDraft[] {
  return rewards
    .filter((r) => (Number(r.quantity) || 0) > 0 && r.ref != null)
    .map((r) => ({
      kind: r.kind,
      currencySlug: r.kind === "currency" ? r.ref : null,
      materialSlug: r.kind === "material" ? r.ref : null,
      quantity: Math.max(0, Number(r.quantity) || 0),
    }));
}

/**
 * A code or event can grant more than one real thing at once — same "add
 * as many rows as apply" interaction Spend's GrantsEditor already
 * established, adapted for currency/material (real inventory) instead of
 * currency/pulls. Not a literal reuse — different domain, different kind
 * enum — but the same idiom on purpose.
 */
export function RewardsEditor({
  rewards,
  onChange,
  currencies,
  materials,
}: {
  rewards: RewardEditDraft[];
  onChange: (next: RewardEditDraft[]) => void;
  currencies: MasterDataRow[];
  materials: MasterDataRow[];
}) {
  function update(i: number, patch: Partial<RewardEditDraft>) {
    onChange(rewards.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(rewards.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rewards.map((r, i) => {
        const options = r.kind === "currency" ? currencies : materials;
        return (
          <div key={i} className="flex gap-1.5 items-center">
            <select
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as "currency" | "material", ref: null })}
              className="w-[92px] flex-none bg-surface border border-white/10 rounded px-1.5 py-1.5 text-[10px] font-mono"
            >
              <option value="currency">CURRENCY</option>
              <option value="material">MATERIAL</option>
            </select>
            <select value={r.ref ?? ""} onChange={(e) => update(i, { ref: e.target.value })} className="flex-1 min-w-0 bg-surface border border-white/10 rounded px-2 py-1.5 text-sm">
              <option value="" disabled>
                Select {r.kind}…
              </option>
              {options.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={r.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              placeholder="qty"
              className="w-[76px] flex-none bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
            />
            <button onClick={() => remove(i)} className="flex-none text-pink/60 hover:text-pink font-mono text-xs px-1">
              ✕
            </button>
          </div>
        );
      })}
      <button
        onClick={() => onChange([...rewards, { kind: "currency", ref: null, quantity: "" }])}
        className="text-left text-[11px] font-mono text-text-faint border border-dashed border-white/10 rounded px-2 py-1.5"
      >
        + add reward
      </button>
    </div>
  );
}
