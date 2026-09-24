import { useMemo, useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { SavingsRuleAction, SavingsRuleKind } from "@grindstone/shared";
import { useEntityList } from "../master-data/api.ts";
import { useIncomeClaims, useIncomeSources, useInventory } from "../planner/api.ts";
import { usePityState, usePullLog } from "../pull-log/api.ts";
import { useRoster } from "../roster/api.ts";
import {
  useCreateSavingsRule,
  useDeleteRuleOverride,
  useDeleteSavingsRule,
  useOverrideRule,
  useReorderSavingsRules,
  useRuleOverrides,
  useSavingsRules,
  useUpdateSavingsRule,
  useWishlistTargets,
} from "./api.ts";
import { computeAffordability, computeTargetStatus, evaluateSavingsRules, targetLabel, type TargetAffordability } from "./wishlistData.ts";

const KIND_LABEL: Record<SavingsRuleKind, string> = {
  pulls_floor: "Never spend below a floor",
  guarantee_only: "Only pull with a guarantee",
  reserve_priority: "Reserve for higher priority first",
  banner_ending_warn: "Warn when a banner is nearly over",
  dupe_cap: "Cap dupes",
  skip_banner_type: "Skip a banner type",
};

export function SavingsRulesTab() {
  const { data: rules = [] } = useSavingsRules();
  const { data: targets = [] } = useWishlistTargets();
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: inventory } = useInventory();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const { data: pools = [] } = usePityState();
  const { data: pulls = [] } = usePullLog();
  const { data: roster = [] } = useRoster();
  const { data: overrides = [] } = useRuleOverrides();

  const reorder = useReorderSavingsRules();
  const update = useUpdateSavingsRule();
  const deleteRule = useDeleteSavingsRule();
  const override = useOverrideRule();
  const deleteOverride = useDeleteRuleOverride();
  const createRule = useCreateSavingsRule();

  const [dragId, setDragId] = useState<number | null>(null);
  const [kind, setKind] = useState<SavingsRuleKind>("pulls_floor");
  const [label, setLabel] = useState("");
  const [threshold, setThreshold] = useState(20);
  const [scopeBannerType, setScopeBannerType] = useState("");
  const [action, setAction] = useState<SavingsRuleAction>("block");

  const characterById = useMemo(() => new Map(characterRows.map((c) => [c.id, c])), [characterRows]);
  const equipmentById = useMemo(() => new Map(equipmentRows.map((e) => [e.id, e])), [equipmentRows]);
  const bannerById = useMemo(() => new Map(bannerRows.map((b) => [b.id, b])), [bannerRows]);
  const bannerTypes = useMemo(() => [...new Set(bannerRows.map((b) => b.type as string).filter(Boolean))], [bannerRows]);
  const pullCurrency = useMemo(() => currencyRows.find((c) => (c.pullCost as number | null) != null), [currencyRows]);

  const statusByTarget = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of targets) map.set(t.id, computeTargetStatus(t, t.bannerId != null ? bannerById.get(t.bannerId) : undefined, pulls));
    return map;
  }, [targets, bannerById, pulls]);
  const activeTargets = useMemo(() => targets.filter((t) => statusByTarget.get(t.id) === "active").sort((a, b) => a.priority - b.priority), [targets, statusByTarget]);
  const affordabilityByTarget = useMemo(() => {
    const map = new Map<number, TargetAffordability>();
    for (const t of activeTargets) {
      const banner = t.bannerId != null ? bannerById.get(t.bannerId) : undefined;
      map.set(t.id, computeAffordability(t, activeTargets, banner, pullCurrency, inventory?.currencies ?? [], incomeSources, claims, pools));
    }
    return map;
  }, [activeTargets, bannerById, pullCurrency, inventory, incomeSources, claims, pools]);
  const characterBuilds = useMemo(
    () => roster.filter((r) => r.build).map((r) => ({ characterId: r.character.id, resonanceLevel: r.build!.resonanceLevel })),
    [roster],
  );

  const enabledRules = rules.filter((r) => r.enabled);
  const evaluations = useMemo(
    () =>
      evaluateSavingsRules(enabledRules, {
        targets: activeTargets,
        affordabilityByTarget,
        banners: bannerById,
        characterById,
        equipmentById,
        characterBuilds,
      }),
    [enabledRules, activeTargets, affordabilityByTarget, bannerById, characterById, equipmentById, characterBuilds],
  );
  const evalByRule = new Map(evaluations.map((e) => [e.ruleId, e]));
  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  const blockingNow = evaluations.find((e) => e.blocking);

  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const ids = sorted.map((r) => r.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
    setDragId(null);
  }

  function submitRule() {
    createRule.mutate({
      label: label.trim() || KIND_LABEL[kind],
      kind,
      threshold: kind === "reserve_priority" ? null : threshold,
      scopeBannerType: kind === "guarantee_only" || kind === "skip_banner_type" ? scopeBannerType || null : null,
      action,
      enabled: true,
      sortOrder: sorted.length,
    });
    setLabel("");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
       <div className="overflow-x-auto">
        <div className="min-w-[640px]">
        <div
          className="grid gap-2 px-2.5 py-1.5 border-b border-border2 font-mono text-[9px] tracking-wide text-text-faint"
          style={{ gridTemplateColumns: "20px 40px 1fr 130px 90px 90px 130px" }}
        >
          <span />
          <span>ON</span>
          <span>RULE</span>
          <span>APPLIES TO</span>
          <span className="text-right">THRESHOLD</span>
          <span className="text-right">ON BREACH</span>
          <span className="text-right">STATUS NOW</span>
        </div>
        {sorted.length === 0 && <div className="p-4 text-xs text-text-faint">No rules yet — add one on the right.</div>}
        {sorted.map((rule) => {
          const evaluation = rule.enabled ? evalByRule.get(rule.id) : undefined;
          const statusText = !rule.enabled ? "off" : (evaluation?.statusText ?? "—");
          const statusCls = !rule.enabled ? "text-text-faint" : evaluation?.blocking ? "text-pink" : evaluation?.warning ? "text-amber" : "text-green";
          return (
            <div
              key={rule.id}
              draggable
              onDragStart={() => setDragId(rule.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(rule.id)}
              className={`grid gap-2 items-center px-2.5 py-2 border-b border-border2 last:border-0 text-xs ${dragId === rule.id ? "opacity-40" : ""}`}
              style={{ gridTemplateColumns: "20px 40px 1fr 130px 90px 90px 130px" }}
            >
              <span className="font-mono text-text-faint cursor-grab select-none">⋮⋮</span>
              <button
                onClick={() => update.mutate({ id: rule.id, body: { enabled: !rule.enabled } })}
                className={`w-[22px] h-[13px] rounded-full flex-none p-0.5 flex ${rule.enabled ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
              >
                <span className="w-[9px] h-[9px] rounded-full bg-ink" />
              </button>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{rule.label}</span>
                <button onClick={() => deleteRule.mutate(rule.id)} className="text-text-faint hover:text-pink flex-none">
                  ✕
                </button>
              </div>
              <span className="font-mono text-[11px] text-text-dim">{rule.scopeBannerType ?? (rule.kind === "reserve_priority" ? "higher priority" : "all")}</span>
              <span className="font-mono text-[11px] text-right">{rule.threshold ?? "—"}</span>
              <span className={`font-mono text-[11px] text-right ${rule.action === "block" ? "text-pink" : rule.action === "warn" ? "text-amber" : "text-text-dim"}`}>
                {rule.action}
              </span>
              <span className={`font-mono text-[11px] text-right ${statusCls}`}>{statusText}</span>
            </div>
          );
        })}
        </div>
       </div>
        <div className={`px-2.5 py-2 border-t border-border2 flex items-center gap-3.5 font-mono text-[11px] ${blockingNow ? "bg-pink/5" : ""}`}>
          <span className="text-text-dim">{enabledRules.length} active</span>
          {blockingNow ? (
            <>
              <span className="text-pink">{blockingNow.statusText.toLowerCase()}</span>
              <button
                onClick={() => override.mutate({ id: blockingNow.ruleId, targetId: activeTargets[0]?.id })}
                className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-text-dim hover:text-text"
              >
                OVERRIDE ONCE
              </button>
            </>
          ) : (
            <span className="text-text-faint">nothing is blocking a pull right now</span>
          )}
          <div className="flex-1" />
          <span className="text-text-faint">rules only advise · nothing stops you in-game</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">RULE BUILDER</div>
          <div className="p-2.5 flex flex-col gap-2.5">
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as SavingsRuleKind);
                setLabel("");
              }}
              className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm"
            >
              {(Object.keys(KIND_LABEL) as SavingsRuleKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={KIND_LABEL[kind]}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
            {(kind === "pulls_floor" || kind === "banner_ending_warn" || kind === "dupe_cap") && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">
                  {kind === "pulls_floor" ? "Min pulls" : kind === "banner_ending_warn" ? "Days before end" : "Max copies (S-level)"}
                </div>
                <input
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(e) => setThreshold(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                />
              </div>
            )}
            {(kind === "guarantee_only" || kind === "skip_banner_type") && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Banner type</div>
                <select value={scopeBannerType} onChange={(e) => setScopeBannerType(e.target.value)} className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm">
                  <option value="">All types</option>
                  {bannerTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Then</div>
              <div className="flex gap-1">
                {(["block", "warn", "log"] as SavingsRuleAction[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`flex-1 text-center font-mono text-[10px] py-1.5 rounded border ${
                      action === a ? "bg-pink/15 border-pink/50 text-pink" : "bg-white/5 border-white/10 text-text-dim"
                    }`}
                  >
                    {a.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={submitRule} className="font-mono text-[11px] py-1.5 rounded bg-amber text-ink">
              ADD RULE
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-2.5 py-2 border-b border-border2 font-sans font-semibold text-[10px] tracking-widest text-text-dim">RECENT OVERRIDES</div>
          <div className="flex flex-col">
            {overrides.length === 0 && <div className="p-3 text-xs text-text-faint">None logged.</div>}
            {overrides
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 6)
              .map((o) => {
                const rule = rules.find((r) => r.id === o.ruleId);
                const target = targets.find((t) => t.id === o.targetId);
                return (
                  <div key={o.id} className="flex items-start gap-2 px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="text-text-dim">{rule?.label ?? "a rule"}</div>
                      <div className="font-mono text-[10px] text-text-faint">
                        {target ? targetLabel(target, characterById, equipmentById) : "—"} · {new Date(o.createdAt * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => deleteOverride.mutate(o.id)} className="text-text-faint hover:text-pink flex-none">
                      ✕
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
