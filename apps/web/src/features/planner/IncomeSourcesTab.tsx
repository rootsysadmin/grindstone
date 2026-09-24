import { useMemo, useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { IncomeCadence, IncomeSourceCategory, IncomeSourceRow } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import {
  useClaimIncomeSource,
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeClaims,
  useIncomeSources,
  useUpdateIncomeSource,
} from "./api.ts";
import { CADENCE_INTERVAL_DAYS, computeIncomeProjection, isClaimedThisPeriod } from "./materialNeeds.ts";

const CATEGORIES: IncomeSourceCategory[] = ["Guaranteed", "Event-dependent", "Speculative"];
const CADENCES: IncomeCadence[] = ["daily", "weekly", "bi-weekly", "monthly", "one-time", "custom"];
// Tailwind's scanner needs full literal class names in source — a
// template-built "bg-${x}" string won't be picked up, so this maps each
// category to its complete class names instead of interpolating a color key.
const CATEGORY_STYLE: Record<IncomeSourceCategory, { text: string; bg: string; dot: string }> = {
  Guaranteed: { text: "text-green", bg: "bg-green", dot: "bg-green" },
  "Event-dependent": { text: "text-amber", bg: "bg-amber", dot: "bg-amber" },
  Speculative: { text: "text-pink", bg: "bg-pink", dot: "bg-pink" },
};
const WINDOW_DAYS = 30;

export function IncomeSourcesTab() {
  const { data: currencies = [] } = useEntityList(entityConfigs.currencies);
  const { data: sources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const createRow = useCreateIncomeSource();
  const updateRow = useUpdateIncomeSource();
  const deleteRow = useDeleteIncomeSource();
  const claimSource = useClaimIncomeSource();
  const [mixCurrencyId, setMixCurrencyId] = useState<number | null>(null);
  const activeMixCurrency = mixCurrencyId ?? (currencies[0]?.id as number | undefined) ?? null;

  const projected = useMemo(() => computeIncomeProjection(sources, WINDOW_DAYS), [sources]);

  const shareOf = (row: (typeof projected)[number]) => {
    const totalForCurrency = projected.filter((p) => p.currencyId === row.currencyId && p.enabled).reduce((a, p) => a + p.projected, 0);
    return totalForCurrency > 0 ? row.projected / totalForCurrency : 0;
  };

  const mixRows = projected.filter((p) => p.currencyId === activeMixCurrency && p.enabled);
  const mixByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    total: mixRows.filter((r) => r.category === cat).reduce((a, r) => a + r.projected, 0),
  })).filter((m) => m.total > 0);
  const mixTotal = mixByCategory.reduce((a, m) => a + m.total, 0);

  const currencyName = (id: number) => currencies.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3 items-start">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Income sources</span>
          <button
            onClick={() =>
              createRow.mutate({
                name: "New source",
                currencyId: currencies[0]?.id ?? null,
                category: "Guaranteed",
                cadence: "daily",
                intervalDays: CADENCE_INTERVAL_DAYS.daily,
                enabled: true,
              })
            }
            className="text-amber font-mono text-[10px]"
          >
            + CUSTOM SOURCE
          </button>
        </div>
        {CATEGORIES.map((category) => {
          const rows = sources.filter((s) => s.category === category);
          if (rows.length === 0) return null;
          return (
            <div key={category}>
              <div className={`px-3 py-1 text-[9px] font-mono uppercase tracking-wide bg-white/[.02] ${CATEGORY_STYLE[category].text}`}>
                {category}
              </div>
              <div className="flex flex-col divide-y divide-border2">
                {rows.map((s) => {
                  const row = projected.find((p) => p.id === s.id)!;
                  return (
                    <SourceRow
                      key={s.id}
                      source={s}
                      currencies={currencies}
                      projected={row.projected}
                      share={shareOf(row)}
                      claimed={isClaimedThisPeriod(s, claims)}
                      onUpdate={(body) => updateRow.mutate({ id: s.id, body })}
                      onDelete={() => deleteRow.mutate(s.id)}
                      onClaim={() => claimSource.mutate(s.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {sources.length === 0 && <div className="p-3 text-xs text-text-faint">No income sources yet.</div>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Mix</span>
            <select
              value={activeMixCurrency ?? ""}
              onChange={(e) => setMixCurrencyId(Number(e.target.value))}
              className="bg-surface border border-white/10 rounded px-1.5 py-1 text-[11px]"
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <div className="h-3 rounded bg-white/10 flex overflow-hidden">
              {mixByCategory.map((m) => (
                <div
                  key={m.category}
                  className={CATEGORY_STYLE[m.category].bg}
                  style={{ width: `${mixTotal > 0 ? (m.total / mixTotal) * 100 : 0}%` }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1 font-mono text-[11px] text-text-dim">
              {mixByCategory.map((m) => (
                <span key={m.category} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-sm ${CATEGORY_STYLE[m.category].dot}`} />
                  <span className="flex-1">{m.category}</span>
                  {mixTotal > 0 ? Math.round((m.total / mixTotal) * 100) : 0}%
                </span>
              ))}
              {mixByCategory.length === 0 && <span className="text-text-faint">No enabled sources for {activeMixCurrency ? currencyName(activeMixCurrency) : "—"}.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceRow({
  source,
  currencies,
  projected,
  share,
  claimed,
  onUpdate,
  onDelete,
  onClaim,
}: {
  source: IncomeSourceRow;
  currencies: { id: number; name: string }[];
  projected: number;
  share: number;
  claimed: boolean;
  onUpdate: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onClaim: () => void;
}) {
  return (
    <div className="px-3 py-1.5 text-xs flex flex-col gap-1.5">
      <div className="overflow-x-auto">
       <div className="min-w-[780px] grid grid-cols-[28px_1fr_100px_120px_100px_70px_90px_70px_24px] gap-2 items-center">
        <button
          onClick={() => onUpdate({ enabled: !source.enabled })}
          className={`w-[22px] h-[13px] rounded-full flex items-center px-0.5 ${source.enabled ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
        >
          <span className="w-[9px] h-[9px] rounded-full bg-ink" />
        </button>
        <input
          defaultValue={source.name}
          className="bg-surface border border-white/10 rounded px-1.5 py-1"
          onBlur={(e) => onUpdate({ name: e.target.value })}
        />
        <select
          defaultValue={source.currencyId}
          className="bg-surface border border-white/10 rounded px-1.5 py-1"
          onChange={(e) => onUpdate({ currencyId: Number(e.target.value) })}
        >
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          defaultValue={source.category}
          className="bg-surface border border-white/10 rounded px-1.5 py-1"
          onChange={(e) => onUpdate({ category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          defaultValue={source.cadence}
          className="bg-surface border border-white/10 rounded px-1.5 py-1"
          onChange={(e) => {
            const cadence = e.target.value as IncomeCadence;
            if (cadence === "one-time") onUpdate({ cadence, intervalDays: null, customCadenceLabel: null });
            else if (cadence === "custom") onUpdate({ cadence });
            else onUpdate({ cadence, intervalDays: CADENCE_INTERVAL_DAYS[cadence], customCadenceLabel: null });
          }}
        >
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          defaultValue={source.amountPerEvent ?? ""}
          placeholder="amt"
          className="bg-surface border border-white/10 rounded px-1.5 py-1 text-right font-mono"
          onBlur={(e) => onUpdate({ amountPerEvent: e.target.value ? Math.max(0, Number(e.target.value)) : null })}
        />
        <div className="flex flex-col items-end">
          <span className="font-mono text-[11px] text-amber">{Math.round(projected).toLocaleString()}/{WINDOW_DAYS}d</span>
          <span className="font-mono text-[9px] text-text-faint">{Math.round(share * 100)}%</span>
        </div>
        <button
          onClick={onClaim}
          disabled={claimed}
          title={claimed ? "Already claimed this period" : "Log that you actually got this"}
          className={`text-[9px] font-mono px-1.5 py-1 rounded ${claimed ? "bg-white/5 text-text-faint" : "bg-amber/15 border border-amber/40 text-amber hover:bg-amber/25"}`}
        >
          {claimed ? "CLAIMED" : "CLAIM"}
        </button>
        <button onClick={onDelete} className="text-pink/70 hover:text-pink font-mono">
          ✕
        </button>
       </div>
      </div>
      {source.cadence === "custom" && (
        <div className="flex gap-2 pl-[36px]">
          <input
            defaultValue={source.customCadenceLabel ?? ""}
            placeholder="cadence label (e.g. per patch)"
            className="flex-1 bg-surface border border-dashed border-white/15 rounded px-1.5 py-1 text-[11px]"
            onBlur={(e) => onUpdate({ customCadenceLabel: e.target.value || null })}
          />
          <input
            type="number"
            min={0}
            defaultValue={source.intervalDays ?? ""}
            placeholder="interval (days)"
            className="w-32 bg-surface border border-dashed border-white/15 rounded px-1.5 py-1 text-[11px] text-right font-mono"
            onBlur={(e) => onUpdate({ intervalDays: e.target.value ? Math.max(0, Number(e.target.value)) : null })}
          />
        </div>
      )}
    </div>
  );
}
