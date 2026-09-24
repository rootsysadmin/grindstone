import { useMemo, useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import { useEntityList, useRankTierMap } from "../master-data/api.ts";
import { useRoster } from "../roster/api.ts";
import { MaterialSwatch } from "../../components/MaterialSwatch.tsx";
import { useCharacterLevelCosts, useEquipmentLevelCosts, useInventory, useSetMaterialStock, useSkillLevelCosts } from "./api.ts";
import { aggregateTotals, deriveCharacterMaterialNeeds, totalByMaterial, totalExpAvailable, withInventory } from "./materialNeeds.ts";

/** Global stock-vs-need across every owned character — the same per-character derivation used on the character Materials tab, summed across the whole roster. */
export function MaterialsTab() {
  const { data: roster = [] } = useRoster();
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const rankTierMap = useRankTierMap();
  const { data: allSkills = [] } = useEntityList(entityConfigs.skills);
  const { data: inventory } = useInventory();
  const { data: characterLevelCosts = [] } = useCharacterLevelCosts();
  const { data: equipmentLevelCosts = [] } = useEquipmentLevelCosts();
  const { data: skillLevelCosts = [] } = useSkillLevelCosts();
  const setStock = useSetMaterialStock();
  const [shortOnly, setShortOnly] = useState(false);

  const rollup = useMemo(() => {
    const totals = roster.map((entry) => {
      const characterSkills = allSkills
        .filter((s) => s.characterId === entry.character.id)
        .map((s) => ({ id: s.id as number, name: s.name }));
      const { lines } = deriveCharacterMaterialNeeds({
        characterId: entry.character.id,
        build: entry.build,
        skillLevels: entry.skillLevels,
        characterSkills,
        characterLevelCosts,
        equipmentLevelCosts,
        skillLevelCosts,
      });
      return totalByMaterial(lines);
    });
    return withInventory(aggregateTotals(totals), inventory?.materials ?? []);
  }, [roster, allSkills, characterLevelCosts, equipmentLevelCosts, skillLevelCosts, inventory]);

  // Roster-wide EXP need, kept in the two strictly separate pools
  // (character/equipment never summed together — see materialNeeds.ts).
  const expNeed = useMemo(() => {
    let character = 0;
    let equipment = 0;
    for (const entry of roster) {
      const characterSkills = allSkills
        .filter((s) => s.characterId === entry.character.id)
        .map((s) => ({ id: s.id as number, name: s.name }));
      const { exp } = deriveCharacterMaterialNeeds({
        characterId: entry.character.id,
        build: entry.build,
        skillLevels: entry.skillLevels,
        characterSkills,
        characterLevelCosts,
        equipmentLevelCosts,
        skillLevelCosts,
      });
      character += exp.character;
      equipment += exp.equipment;
    }
    return { character, equipment };
  }, [roster, allSkills, characterLevelCosts, equipmentLevelCosts, skillLevelCosts]);

  const expMaterials = materials.map((m) => ({ id: m.id as number, expValue: m.expValue as number | null, expUsage: m.expUsage as string | null }));
  const characterExpHave = totalExpAvailable(expMaterials, inventory?.materials ?? [], "character");
  const equipmentExpHave = totalExpAvailable(expMaterials, inventory?.materials ?? [], "equipment");

  const rows = rollup
    .map((r) => ({ ...r, material: materials.find((m) => m.id === r.materialId) }))
    .filter((r) => r.material)
    .filter((r) => !shortOnly || r.short > 0)
    .sort((a, b) => b.short - a.short);

  const shortCount = rollup.filter((r) => r.short > 0).length;
  const weeklyCappedShortCount = rollup.filter(
    (r) => r.short > 0 && materials.find((m) => m.id === r.materialId)?.weeklyCap,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-faint">across {roster.filter((r) => r.build).length} owned characters</span>
        <div className="flex-1" />
        <button
          onClick={() => setShortOnly((v) => !v)}
          className={`text-[10px] font-mono px-2 py-1 rounded-md border ${shortOnly ? "bg-pink/15 border-pink/40 text-pink" : "bg-white/5 border-white/10 text-text-dim"}`}
        >
          SHORT ONLY · {shortCount}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Materials tracked</div>
          <div className="font-display font-bold text-xl">{rollup.length}</div>
        </div>
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Short</div>
          <div className="font-display font-bold text-xl text-pink">{shortCount}</div>
        </div>
        <div className="bg-surface border border-border2 rounded-lg p-3">
          <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Weekly-capped &amp; short</div>
          <div className="font-display font-bold text-xl text-amber">{weeklyCappedShortCount}</div>
        </div>
      </div>

      {(expNeed.character > 0 || expNeed.equipment > 0) && (
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
            EXP · roster-wide, two separate pools
          </div>
          <div className="flex flex-col">
            {[
              { label: "Character EXP", need: expNeed.character, have: characterExpHave },
              { label: "Weapon EXP", need: expNeed.equipment, have: equipmentExpHave },
            ]
              .filter((r) => r.need > 0)
              .map((r) => {
                const short = Math.max(0, r.need - r.have);
                const coverage = r.need > 0 ? Math.min(1, r.have / r.need) : 1;
                return (
                  <div key={r.label} className="grid grid-cols-[1fr_88px_88px_88px_1fr] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                    <span>{r.label}</span>
                    <span className="font-mono text-right text-text-dim">{r.have}</span>
                    <span className="font-mono text-right text-text-dim">{r.need}</span>
                    <span className={`font-mono text-right ${short > 0 ? "text-pink" : "text-green"}`}>{short}</span>
                    <div className="h-1.5 rounded bg-white/10">
                      <div
                        className={`h-full rounded ${coverage >= 1 ? "bg-green" : coverage >= 0.5 ? "bg-amber" : "bg-pink"}`}
                        style={{ width: `${Math.round(coverage * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
       <div className="overflow-x-auto">
        <div className="min-w-[560px]">
        <div className="grid grid-cols-[30px_1fr_88px_88px_88px_1fr] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
          <span></span>
          <span>Material</span>
          <span className="text-right">Have</span>
          <span className="text-right">Need</span>
          <span className="text-right">Short</span>
          <span>Coverage</span>
        </div>
        <div className="flex flex-col">
          {rows.length === 0 && <div className="p-3 text-xs text-text-faint">Nothing tracked yet.</div>}
          {rows.map((r) => {
            const material = r.material!;
            const alt = material.alternativeMaterialId
              ? materials.find((m) => m.id === material.alternativeMaterialId)
              : null;
            const altStock = alt ? (inventory?.materials.find((i) => i.materialId === alt.id)?.quantity ?? 0) : 0;
            return (
              <div key={r.materialId} className="grid grid-cols-[30px_1fr_88px_88px_88px_1fr] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                <MaterialSwatch material={{ color: rankTierMap.get(material.rankTierId as number)?.color ?? null, imageUrl: material.imageUrl as string | null, name: material.name }} />
                <div className="flex flex-col">
                  <span>{material.name}</span>
                  {r.short > 0 && alt && (
                    <span className="text-[10px] text-text-faint">alt: {alt.name} (have {altStock})</span>
                  )}
                  {r.short > 0 && material.weeklyCap ? (
                    <span className="text-[10px] text-amber">weekly cap {String(material.weeklyCap)}</span>
                  ) : null}
                </div>
                <input
                  key={r.have}
                  type="number"
                  min={0}
                  defaultValue={r.have}
                  className="bg-surface border border-white/10 rounded px-1.5 py-1 text-right font-mono"
                  onBlur={(e) => setStock.mutate({ materialId: r.materialId, quantity: Math.max(0, Number(e.target.value)) })}
                />
                <span className="font-mono text-right text-text-dim">{r.need}</span>
                <span className={`font-mono text-right ${r.short > 0 ? "text-pink" : "text-green"}`}>{r.short}</span>
                <div className="h-1.5 rounded bg-white/10">
                  <div
                    className={`h-full rounded ${r.coverage >= 1 ? "bg-green" : r.coverage >= 0.5 ? "bg-amber" : "bg-pink"}`}
                    style={{ width: `${Math.round(r.coverage * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        </div>
       </div>
      </div>
    </div>
  );
}
