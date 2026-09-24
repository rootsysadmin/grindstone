import { useMemo } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { MasterDataRow, RosterEntry } from "@grindstone/shared";
import { useEntityList, useRankTierMap } from "../master-data/api.ts";
import { MaterialSwatch } from "../../components/MaterialSwatch.tsx";
import {
  useCharacterLevelCosts,
  useCreateFarmRouteEntry,
  useEquipmentLevelCosts,
  useInventory,
  useSetMaterialStock,
  useSkillLevelCosts,
} from "../planner/api.ts";
import {
  deriveCharacterMaterialNeeds,
  findBottleneck,
  groupBySection,
  totalByMaterial,
  totalExpAvailable,
  withInventory,
} from "../planner/materialNeeds.ts";

/**
 * Remaining need, derived — not manually tracked. See
 * ../planner/materialNeeds.ts's header comment for why: character/weapon/
 * skill level are already tracked, so once a cost schedule is sourced on
 * the Data page, this auto-updates the instant a level is saved.
 */
export function CharacterMaterialsTab({
  characterId,
  entry,
  roster,
  allSkills,
  characterName,
}: {
  characterId: number;
  entry: RosterEntry;
  roster: RosterEntry[];
  allSkills: MasterDataRow[];
  characterName: string;
}) {
  const { data: materials = [] } = useEntityList(entityConfigs.materials);
  const rankTierMap = useRankTierMap();
  const { data: inventory } = useInventory();
  const { data: characterLevelCosts = [] } = useCharacterLevelCosts();
  const { data: equipmentLevelCosts = [] } = useEquipmentLevelCosts();
  const { data: skillLevelCosts = [] } = useSkillLevelCosts();
  const setStock = useSetMaterialStock();
  const addToRoute = useCreateFarmRouteEntry();

  const skillsFor = (charId: number) =>
    allSkills.filter((s) => s.characterId === charId).map((s) => ({ id: s.id as number, name: s.name }));

  const { lines, exp } = useMemo(
    () =>
      deriveCharacterMaterialNeeds({
        characterId,
        build: entry.build,
        skillLevels: entry.skillLevels,
        characterSkills: skillsFor(characterId),
        characterLevelCosts,
        equipmentLevelCosts,
        skillLevelCosts,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, entry, allSkills, characterLevelCosts, equipmentLevelCosts, skillLevelCosts],
  );

  const perCharacterTotals = useMemo(() => {
    const map = new Map<number, Map<number, number>>();
    for (const r of roster) {
      const { lines: l } = deriveCharacterMaterialNeeds({
        characterId: r.character.id,
        build: r.build,
        skillLevels: r.skillLevels,
        characterSkills: skillsFor(r.character.id),
        characterLevelCosts,
        equipmentLevelCosts,
        skillLevelCosts,
      });
      map.set(r.character.id, totalByMaterial(l));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, allSkills, characterLevelCosts, equipmentLevelCosts, skillLevelCosts]);

  const rollupRows = withInventory(totalByMaterial(lines), inventory?.materials ?? []);
  const rollupByMaterial = new Map(rollupRows.map((r) => [r.materialId, r]));
  const sections = groupBySection(lines);
  const bottleneck = findBottleneck(
    rollupRows,
    materials.map((m) => ({ id: m.id as number, weeklyCap: m.weeklyCap as number | null })),
  );
  const bottleneckMaterial = bottleneck ? materials.find((m) => m.id === bottleneck.materialId) : null;

  const sharedWith: { characterName: string; materialName: string }[] = [];
  for (const [materialId] of totalByMaterial(lines)) {
    for (const r of roster) {
      if (r.character.id === characterId) continue;
      const total = perCharacterTotals.get(r.character.id);
      if (total && (total.get(materialId) ?? 0) > 0) {
        sharedWith.push({ characterName: r.character.name, materialName: materials.find((m) => m.id === materialId)?.name ?? "?" });
      }
    }
  }

  // EXP need/have, kept in two strictly separate pools (character vs.
  // equipment) — see materialNeeds.ts's header comment.
  const expByUsage = (usage: "character" | "equipment") =>
    totalExpAvailable(
      materials.map((m) => ({ id: m.id as number, expValue: m.expValue as number | null, expUsage: m.expUsage as string | null })),
      inventory?.materials ?? [],
      usage,
    );
  const characterExpHave = expByUsage("character");
  const equipmentExpHave = expByUsage("equipment");
  const hasWeapon = entry.build?.equippedEquipmentItemId != null;

  const sectionByName = new Map(sections.map((s) => [s[0]?.section, s]));
  const orderedSectionNames: string[] = [];
  if (sectionByName.has("Character Level") || exp.character > 0) orderedSectionNames.push("Character Level");
  if (hasWeapon && (sectionByName.has("Weapon") || exp.equipment > 0)) orderedSectionNames.push("Weapon");
  for (const s of sections) {
    const name = s[0]?.section;
    if (name && name !== "Character Level" && name !== "Weapon") orderedSectionNames.push(name);
  }

  if (lines.length === 0 && exp.character === 0 && exp.equipment === 0) {
    return (
      <div className="text-text-dim text-sm p-6">
        No material cost data sourced yet for this character's level/weapon/skills — add a cost schedule on the Data page.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3">
      <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
       <div className="overflow-x-auto">
        <div className="min-w-[560px]">
        <div className="grid grid-cols-[30px_1fr_72px_72px_72px_1fr_28px] gap-2 px-3 py-1.5 border-b border-border2 font-mono text-[9px] uppercase tracking-wide text-text-faint">
          <span></span>
          <span>Material</span>
          <span className="text-right">Have</span>
          <span className="text-right">Need</span>
          <span className="text-right">Short</span>
          <span>Coverage</span>
          <span></span>
        </div>
        {orderedSectionNames.map((sectionName) => {
          const section = sectionByName.get(sectionName) ?? [];
          const sectionExpNeed = sectionName === "Character Level" ? exp.character : sectionName === "Weapon" ? exp.equipment : 0;
          const sectionExpHave = sectionName === "Character Level" ? characterExpHave : sectionName === "Weapon" ? equipmentExpHave : 0;
          return (
          <div key={sectionName}>
            <div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wide bg-white/[.02] text-blue">{sectionName}</div>
            {sectionExpNeed > 0 && (
              <div className="grid grid-cols-[30px_1fr_72px_72px_72px_1fr_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                <span className="font-mono text-[10px] text-blue text-center">EXP</span>
                <span>EXP</span>
                <span className="font-mono text-right text-text-dim">{sectionExpHave}</span>
                <span className="font-mono text-right text-text-dim">{sectionExpNeed}</span>
                <span className={`font-mono text-right ${Math.max(0, sectionExpNeed - sectionExpHave) > 0 ? "text-pink" : "text-green"}`}>
                  {Math.max(0, sectionExpNeed - sectionExpHave)}
                </span>
                <div className="h-1.5 rounded bg-white/10">
                  <div
                    className={`h-full rounded ${sectionExpHave >= sectionExpNeed ? "bg-green" : sectionExpHave >= sectionExpNeed / 2 ? "bg-amber" : "bg-pink"}`}
                    style={{ width: `${Math.round(Math.min(1, sectionExpNeed > 0 ? sectionExpHave / sectionExpNeed : 1) * 100)}%` }}
                  />
                </div>
                <span />
              </div>
            )}
            {section.map(({ materialId }) => {
              const row = rollupByMaterial.get(materialId);
              const material = materials.find((m) => m.id === materialId);
              if (!row || !material) return null;
              return (
                <div key={materialId} className="grid grid-cols-[30px_1fr_72px_72px_72px_1fr_28px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <MaterialSwatch material={{ color: rankTierMap.get(material.rankTierId as number)?.color ?? null, imageUrl: material.imageUrl as string | null, name: material.name }} />
                  <div className="flex flex-col">
                    <span>{material.name}</span>
                    {row.short > 0 && material.alternativeMaterialId ? (
                      <span className="text-[10px] text-text-faint">
                        alt: {materials.find((m) => m.id === material.alternativeMaterialId)?.name}
                        {" (have "}
                        {inventory?.materials.find((i) => i.materialId === material.alternativeMaterialId)?.quantity ?? 0}
                        {")"}
                      </span>
                    ) : null}
                  </div>
                  <input
                    key={row.have}
                    type="number"
                    min={0}
                    defaultValue={row.have}
                    className="bg-surface border border-white/10 rounded px-1.5 py-1 text-right font-mono"
                    onBlur={(e) => setStock.mutate({ materialId, quantity: Math.max(0, Number(e.target.value)) })}
                  />
                  <span className="font-mono text-right text-text-dim">{row.need}</span>
                  <span className={`font-mono text-right ${row.short > 0 ? "text-pink" : "text-green"}`}>{row.short}</span>
                  <div className="h-1.5 rounded bg-white/10">
                    <div
                      className={`h-full rounded ${row.coverage >= 1 ? "bg-green" : row.coverage >= 0.5 ? "bg-amber" : "bg-pink"}`}
                      style={{ width: `${Math.round(row.coverage * 100)}%` }}
                    />
                  </div>
                  {row.short > 0 ? (
                    <button
                      title="Add to farm route"
                      onClick={() =>
                        addToRoute.mutate({
                          label: material.name,
                          targetLabel: material.name,
                          forLabel: characterName,
                          plannedRuns: 1,
                        })
                      }
                      className="text-amber font-mono text-[13px]"
                    >
                      +
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
        </div>
       </div>
      </div>

      <div className="flex flex-col gap-3">
        {bottleneck && bottleneckMaterial && (
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Bottleneck</div>
            <div className="p-2.5 text-xs text-text-dim leading-relaxed">
              <span className="text-text">{bottleneckMaterial.name}</span> is weekly-capped at {String(bottleneckMaterial.weeklyCap)}.{" "}
              {bottleneck.short} more means <span className="text-pink font-mono">{bottleneck.resets} more resets</span> no matter how much you farm.
            </div>
          </div>
        )}

        {sharedWith.length > 0 && (
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Shared with</div>
            <div className="flex flex-col">
              {sharedWith.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <span className="flex-1">{s.characterName}</span>
                  <span className="font-mono text-[11px] text-amber">{s.materialName}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border2 font-mono text-[10px] text-text-faint">
              planner totals account for both
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
