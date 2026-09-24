import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { entityConfigs, interpolateLabel } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import { useEntityList, useRankTierMap, useUpdateRow } from "../master-data/api.ts";
import { useGameSettings, useQuickOwnCharacter, useRoster, useSaveBuild, useUnownCharacter, type SaveBuildBody } from "./api.ts";
import { computeBuildRing, type CharacterSkillCap, type RingResult } from "./buildProgress.ts";
import { BuildRing } from "./BuildRing.tsx";
import { AugmentSlotsSection } from "./AugmentSlotsSection.tsx";
import { ModuleSetSection } from "./ModuleSetSection.tsx";
import { StatTargetsSection } from "./StatTargetsSection.tsx";
import { TeamsTab } from "./TeamsTab.tsx";
import { CharacterMaterialsTab } from "./CharacterMaterialsTab.tsx";

type Tab = "build" | "materials" | "teams";
type FormState = SaveBuildBody;

export function CharacterDetailPage() {
  const { id } = useParams();
  const characterId = Number(id);
  const { slug: gameSlug, config: gameConfig } = useActiveGame();
  const qc = useQueryClient();
  const { data: roster = [] } = useRoster();
  const rankTierMap = useRankTierMap();
  const { data: settings } = useGameSettings();
  const { data: allSkills = [] } = useEntityList(entityConfigs.skills);
  const { data: equipmentItems = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: elements = [] } = useEntityList(entityConfigs.elements);
  const saveBuild = useSaveBuild();
  const quickOwn = useQuickOwnCharacter();
  const unown = useUnownCharacter();
  const updateCharacter = useUpdateRow(entityConfigs.characters);

  const [tab, setTab] = useState<Tab>("build");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const entry = roster.find((r) => r.character.id === characterId);
  const characterSkills = useMemo(() => allSkills.filter((s) => s.characterId === characterId), [allSkills, characterId]);

  // Fallbacks only cover the instant before /settings resolves (same-origin,
  // near-instant) — real values always come from the DB row.
  const caps = {
    maxCharacterLevel: settings?.maxCharacterLevel ?? 1,
    maxResonanceLevel: settings?.maxResonanceLevel ?? 1,
    maxSkillLevel: settings?.maxSkillLevel ?? 1,
    maxEquipmentLevel: settings?.maxEquipmentLevel ?? 1,
  };

  const skillsByChar = useMemo(() => {
    const map = new Map<number, CharacterSkillCap[]>();
    for (const s of allSkills) {
      const cid = s.characterId as number | null;
      if (cid == null) continue;
      const cap: CharacterSkillCap = { id: s.id as number, maxLevel: (s.maxLevel as number | null) ?? null };
      map.set(cid, [...(map.get(cid) ?? []), cap]);
    }
    return map;
  }, [allSkills]);

  const ringByCharacter = useMemo(() => {
    const map = new Map<number, RingResult>();
    for (const r of roster) map.set(r.character.id, computeBuildRing(r, caps, skillsByChar.get(r.character.id) ?? []));
    return map;
  }, [roster, skillsByChar, caps]);

  const ring = entry ? ringByCharacter.get(entry.character.id)! : null;

  function resetForm() {
    if (!entry) return;
    const levelBySkill = new Map(entry.skillLevels.map((s) => [s.skillId, s.level]));
    setForm({
      level: entry.build?.level ?? 1,
      resonanceLevel: entry.build?.resonanceLevel ?? 0,
      equippedEquipmentItemId: entry.build?.equippedEquipmentItemId ?? null,
      equippedEquipmentLevel: entry.build?.equippedEquipmentLevel ?? null,
      equippedEquipmentRefinement: entry.build?.equippedEquipmentRefinement ?? null,
      notes: entry.build?.notes ?? "",
      skillLevels: characterSkills.map((s) => ({ skillId: s.id, level: levelBySkill.get(s.id) ?? 0 })),
    });
  }

  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.build?.updatedAt, characterId, characterSkills.length]);

  if (!entry || !form) {
    return (
      <div className="p-6 text-text-dim text-sm">
        {roster.length === 0 ? "Loading…" : "Character not found."}
      </div>
    );
  }

  const { character } = entry;
  const elementName = elements.find((e) => e.id === character.elementId)?.name ?? "—";

  async function handleSave() {
    await saveBuild.mutateAsync({ characterId, body: form! });
    setEditing(false);
  }

  function handleOwn() {
    quickOwn.mutate(characterId);
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <Link to="/roster" className="font-mono text-xs text-text-faint hover:text-text-dim">
            Roster /
          </Link>
          <div className="font-display font-bold text-lg">{character.name}</div>
          <span className="font-mono text-[9px] bg-amber/15 border border-amber/40 text-amber px-1.5 py-0.5 rounded tracking-wide">
            {elementName.toUpperCase()} · {rankTierMap.get(character.rankTierId as number)?.name ?? "—"}
          </span>
          {editing && (
            <span className="font-mono text-[9px] bg-blue/15 border border-blue/45 text-blue px-1.5 py-0.5 rounded tracking-wide">EDITING</span>
          )}
          <div className="flex-1" />
          {!entry.build ? (
            <button onClick={handleOwn} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium">
              MARK OWNED
            </button>
          ) : editing ? (
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setEditing(false);
                  resetForm();
                }}
                className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim"
              >
                DISCARD
              </button>
              <button onClick={handleSave} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-blue text-[#06202e] font-medium">
                SAVE
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  if (confirm(`Mark ${character.name} as not owned? This clears build/skill state.`)) unown.mutate(characterId);
                }}
                className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-pink/70"
              >
                UN-OWN
              </button>
              <button onClick={() => setEditing(true)} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim">
                EDIT
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-0.5">
          {(["build", "materials", "teams"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 font-sans font-semibold text-[11px] tracking-wide border-b-2 uppercase ${
                tab === t ? "text-amber border-amber" : "text-text-dim border-transparent hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        {!entry.build ? (
          <div className="text-text-dim text-sm p-6">Not owned yet — mark it owned to start tracking a build.</div>
        ) : tab === "teams" ? (
          <TeamsTab characterId={characterId} roster={roster} ringByCharacter={ringByCharacter} />
        ) : tab === "materials" ? (
          <CharacterMaterialsTab
            characterId={characterId}
            entry={entry}
            roster={roster}
            allSkills={allSkills}
            characterName={character.name}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[236px_1fr_320px] gap-3">
            <BuildRing ring={ring!} />

            <div className="flex flex-col gap-3 min-w-0">
              <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
                  Levels &amp; {interpolateLabel("{term:resonanceLevel}", gameConfig.terms)}
                </div>
                <div className="p-2.5 grid grid-cols-2 gap-2">
                  <StatBox
                    label="Level"
                    value={form.level}
                    max={caps.maxCharacterLevel}
                    editing={editing}
                    onChange={(v) => setForm({ ...form, level: v })}
                  />
                  <StatBox
                    label={interpolateLabel("{term:resonanceLevel}", gameConfig.terms)}
                    value={form.resonanceLevel}
                    max={caps.maxResonanceLevel}
                    editing={editing}
                    onChange={(v) => setForm({ ...form, resonanceLevel: v })}
                  />
                </div>
                <div className="px-2.5 pb-2.5 font-mono text-[9px] text-text-faint">
                  {interpolateLabel("{term:resonanceLevel}", gameConfig.terms)} doesn't count toward build % — see notes below.
                </div>
              </div>

              <AugmentSlotsSection
                characterId={characterId}
                maxSlots={character.maxAugmentSlots ?? 0}
                onChangeMaxSlots={(v) =>
                  updateCharacter.mutate(
                    { id: characterId, body: { maxAugmentSlots: v } },
                    { onSuccess: () => qc.invalidateQueries({ queryKey: ["roster", gameSlug] }) },
                  )
                }
              />

              <ModuleSetSection characterId={characterId} maxSlots={character.maxAugmentSlots ?? 0} />

              {characterSkills.length > 0 && (
                <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Skills</div>
                  <div className="flex flex-col">
                    {characterSkills.map((s) => {
                      const skillMax = (s.maxLevel as number | null) ?? caps.maxSkillLevel;
                      const idx = form.skillLevels.findIndex((sl) => sl.skillId === s.id);
                      const level = form.skillLevels[idx]?.level ?? 0;
                      const pct = Math.min(100, Math.round((level / skillMax) * 100));
                      const maxed = level >= skillMax;
                      return (
                        <div key={s.id} className="grid grid-cols-[1fr_150px_56px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                          <span>{s.name}</span>
                          <div className="h-1.5 rounded bg-white/10">
                            <div className={`h-full rounded ${maxed ? "bg-green" : "bg-amber"}`} style={{ width: `${pct}%` }} />
                          </div>
                          {editing ? (
                            <input
                              type="number"
                              min={0}
                              max={skillMax}
                              value={level}
                              onChange={(e) => {
                                const next = [...form.skillLevels];
                                const v = Math.max(0, Math.min(skillMax, Number(e.target.value)));
                                if (idx >= 0) next[idx] = { skillId: s.id, level: v };
                                else next.push({ skillId: s.id, level: v });
                                setForm({ ...form, skillLevels: next });
                              }}
                              className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-center font-mono"
                            />
                          ) : (
                            <span className={`font-mono text-right ${maxed ? "text-green" : ""}`}>
                              {level}/{skillMax}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Notes</div>
                {editing ? (
                  <textarea
                    value={form.notes ?? ""}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    className="w-full bg-white/5 border-0 px-3 py-2 text-xs outline-none resize-none"
                    placeholder={`Rotation, ${interpolateLabel("{term:resonanceLevel}", gameConfig.terms).toLowerCase()} unlocks, anything freeform.`}
                  />
                ) : (
                  <div className="px-3 py-2 text-xs text-text-dim whitespace-pre-wrap">{form.notes || "No notes yet."}</div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">
                  {interpolateLabel("{term:equipmentItem} · equipped", gameConfig.terms)}
                </div>
                <div className="p-2.5 flex flex-col gap-2">
                  {editing ? (
                    <select
                      value={form.equippedEquipmentItemId ?? ""}
                      onChange={(e) => setForm({ ...form, equippedEquipmentItemId: e.target.value ? Number(e.target.value) : null })}
                      className="bg-surface border border-white/10 rounded px-2 py-1.5 text-xs"
                    >
                      <option value="">— none —</option>
                      {equipmentItems.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm font-display font-semibold">
                      {equipmentItems.find((eq) => eq.id === form.equippedEquipmentItemId)?.name ?? "— none —"}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <NumberField
                      label="Level"
                      value={form.equippedEquipmentLevel}
                      max={caps.maxEquipmentLevel}
                      editing={editing}
                      onChange={(v) => setForm({ ...form, equippedEquipmentLevel: v })}
                    />
                    <NumberField
                      label="Refinement"
                      value={form.equippedEquipmentRefinement}
                      editing={editing}
                      onChange={(v) => setForm({ ...form, equippedEquipmentRefinement: v })}
                    />
                  </div>
                </div>
              </div>

              <StatTargetsSection characterId={characterId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  max,
  editing,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  editing: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-white/[.03] border border-white/10 rounded-md p-2">
      <div className="font-mono text-[9px] text-text-faint mb-1">{label.toUpperCase()}</div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-5 h-5 rounded bg-white/5 border border-white/10 text-text-dim grid place-items-center"
          >
            −
          </button>
          <span className="flex-1 text-center font-display font-bold text-base">{value}</span>
          <button
            onClick={() => onChange(Math.min(max, value + 1))}
            className="w-5 h-5 rounded bg-white/5 border border-white/10 text-text-dim grid place-items-center"
          >
            +
          </button>
        </div>
      ) : (
        <div className="font-display font-bold text-lg">
          {value}
          <span className="text-xs text-text-faint">/{max}</span>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  max,
  editing,
  onChange,
}: {
  label: string;
  value: number | null;
  max?: number;
  editing: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex-1">
      <div className="font-mono text-[9px] text-text-faint mb-1">{label.toUpperCase()}</div>
      {editing ? (
        <input
          type="number"
          min={0}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono"
        />
      ) : (
        <div className="font-mono text-xs">
          {value ?? "—"}
          {max !== undefined && <span className="text-text-faint">/{max}</span>}
        </div>
      )}
    </div>
  );
}
