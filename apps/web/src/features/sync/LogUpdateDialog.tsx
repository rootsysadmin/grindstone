import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { entityConfigs, interpolateLabel, type MasterDataRow, type UpdateKind, type UpdatePayload } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import { useEntityList } from "../master-data/api.ts";
import { useApplyUpdate, useSyncSettings } from "./api.ts";
import { LevelCostsEditor, levelCostsToPayload, type LevelCostBandEditDraft } from "./LevelCostsEditor.tsx";
import { RewardsEditor, rewardsToPayload, type RewardEditDraft } from "./RewardsEditor.tsx";
import { slugify } from "./slugify.ts";

const KIND_OPTIONS: { key: UpdateKind; label: string }[] = [
  { key: "code", label: "Code" },
  { key: "banner", label: "Banner" },
  { key: "event", label: "Event" },
  { key: "level-costs", label: "Mat. costs" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Screen 09-style "log an update" dialog — lives on the Data page (next to
 * Sync Settings) rather than tucked into any one type's own widget, since
 * it handles all three types and belongs somewhere type-neutral. Manual
 * structured entry only this stage (AI-assisted extraction from pasted
 * text is deferred, see docs/progress.md's Stage 10 entry). Two independent
 * actions on submit: apply it to this install directly (the same
 * provenance-safe engine a community sync uses — for codes/events this
 * includes real, creditable reward rows, not just a description), and/or
 * format it into the community-repo's file convention and hand off to
 * GitHub's own pre-filled new-file page — no GitHub token ever touches
 * this app.
 */
export function LogUpdateDialog({ onClose }: { onClose: () => void }) {
  const { config: gameConfig, slug: gameSlug } = useActiveGame();
  const { data: characterRows = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentRows = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: skillRows = [] } = useEntityList(entityConfigs.skills);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: materialRows = [] } = useEntityList(entityConfigs.materials);
  const { data: elementRows = [] } = useEntityList(entityConfigs.elements);
  const { data: settings } = useSyncSettings();
  const applyUpdate = useApplyUpdate();

  const [kind, setKind] = useState<UpdateKind>("code");
  const [applied, setApplied] = useState(false);

  // code fields
  const [code, setCode] = useState("");
  const [rewardLabel, setRewardLabel] = useState("");
  const [codeRewards, setCodeRewards] = useState<RewardEditDraft[]>([]);

  // banner fields
  const [bannerName, setBannerName] = useState("");
  const [bannerType, setBannerType] = useState("");
  const [bannerStart, setBannerStart] = useState(todayIso());
  const [bannerEnd, setBannerEnd] = useState("");
  const [featuredMode, setFeaturedMode] = useState<"existing" | "new">("existing");
  const [featuredSearch, setFeaturedSearch] = useState("");
  const [featured, setFeatured] = useState<{ kind: "character" | "equipment"; row: MasterDataRow } | null>(null);
  // "new" mode — this banner introduces something not yet in the roster
  const [newKind, setNewKind] = useState<"character" | "equipment">("character");
  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState("");
  const [newElementSlug, setNewElementSlug] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newReleaseDate, setNewReleaseDate] = useState("");
  const [newType, setNewType] = useState("");
  const [newMainStat, setNewMainStat] = useState("");

  // event fields
  const [eventName, setEventName] = useState("");
  const [eventStart, setEventStart] = useState(todayIso());
  const [eventEnd, setEventEnd] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventRewards, setEventRewards] = useState<RewardEditDraft[]>([]);

  // level-costs fields
  const [targetKind, setTargetKind] = useState<"character" | "equipment" | "skill">("character");
  const [targetSearch, setTargetSearch] = useState("");
  const [target, setTarget] = useState<MasterDataRow | null>(null);
  const [levelCostBands, setLevelCostBands] = useState<LevelCostBandEditDraft[]>([]);

  const featuredCandidates = useMemo(() => {
    const q = featuredSearch.trim().toLowerCase();
    const all = [...characterRows.map((row) => ({ kind: "character" as const, row })), ...equipmentRows.map((row) => ({ kind: "equipment" as const, row }))];
    if (!q) return all.slice(0, 6);
    return all.filter((c) => c.row.name.toLowerCase().includes(q)).slice(0, 6);
  }, [featuredSearch, characterRows, equipmentRows]);

  const targetRows = targetKind === "character" ? characterRows : targetKind === "equipment" ? equipmentRows : skillRows;
  const targetCandidates = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return targetRows.slice(0, 6);
    return targetRows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6);
  }, [targetSearch, targetRows]);

  const payload: UpdatePayload | null = useMemo(() => {
    if (kind === "code") {
      if (!code.trim()) return null;
      return { kind: "code", code: code.trim(), rewardLabel: rewardLabel.trim() || null, rewards: rewardsToPayload(codeRewards) };
    }
    if (kind === "banner") {
      if (!bannerName.trim()) return null;
      const newCharacter = featuredMode === "new" && newKind === "character" && newName.trim()
        ? {
            name: newName.trim(),
            rank: newRank.trim() || null,
            elementSlug: newElementSlug || null,
            role: newRole.trim() || null,
            releaseDate: newReleaseDate || null,
          }
        : null;
      const newEquipment = featuredMode === "new" && newKind === "equipment" && newName.trim()
        ? { name: newName.trim(), rank: newRank.trim() || null, type: newType.trim() || null, mainStat: newMainStat.trim() || null }
        : null;
      return {
        kind: "banner",
        name: bannerName.trim(),
        type: bannerType.trim() || null,
        featuredCharacterSlug: featuredMode === "existing" && featured?.kind === "character" ? featured.row.slug : null,
        featuredEquipmentSlug: featuredMode === "existing" && featured?.kind === "equipment" ? featured.row.slug : null,
        newCharacter,
        newEquipment,
        startDate: bannerStart || null,
        endDate: bannerEnd || null,
      };
    }
    if (kind === "event") {
      if (!eventName.trim()) return null;
      return {
        kind: "event",
        name: eventName.trim(),
        startDate: eventStart || null,
        endDate: eventEnd || null,
        notes: eventNotes.trim() || null,
        rewards: rewardsToPayload(eventRewards),
      };
    }
    // level-costs
    if (!target) return null;
    const { bands, newMaterials } = levelCostsToPayload(levelCostBands);
    if (bands.length === 0) return null;
    return { kind: "level-costs", targetKind, targetSlug: target.slug, newMaterials: newMaterials.length > 0 ? newMaterials : undefined, bands };
  }, [
    kind,
    code,
    rewardLabel,
    codeRewards,
    bannerName,
    bannerType,
    bannerStart,
    bannerEnd,
    featuredMode,
    featured,
    newKind,
    newName,
    newRank,
    newElementSlug,
    newRole,
    newReleaseDate,
    newType,
    newMainStat,
    eventName,
    eventStart,
    eventEnd,
    eventNotes,
    eventRewards,
    targetKind,
    target,
    levelCostBands,
  ]);

  function applyLocally() {
    if (!payload) return;
    applyUpdate.mutate(payload, { onSuccess: () => setApplied(true) });
  }

  function contribute() {
    if (!payload || !settings?.dataRepoOwner || !settings.dataRepoName) return;
    const folder = payload.kind === "code" ? "codes" : payload.kind === "banner" ? "banners" : payload.kind === "event" ? "events" : "level-costs";
    const fileSlug = payload.kind === "code" ? slugify(payload.code) : payload.kind === "level-costs" ? `${payload.targetKind}-${payload.targetSlug}` : slugify(payload.name);
    const filename = `games/${gameSlug}/${folder}/${todayIso()}-${fileSlug}.json`;
    const value = JSON.stringify(payload, null, 2);
    const url = `https://github.com/${settings.dataRepoOwner}/${settings.dataRepoName}/new/main?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(value)}`;
    window.open(url, "_blank");
  }

  const canRepoContribute = Boolean(settings?.dataRepoOwner && settings?.dataRepoName);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-[440px] max-w-full max-h-[88vh] overflow-y-auto bg-panel border border-white/10 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">Log an update</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Type">
            <div className="flex gap-1.5">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.key}
                  onClick={() => {
                    setKind(k.key);
                    setApplied(false);
                  }}
                  className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${kind === k.key ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
                >
                  {k.label.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {kind === "code" && (
            <>
              <Field label="Code">
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SUMMERTIME" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Description (optional, free text)">
                <input value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} placeholder="e.g. login bonus" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Rewards (optional — credited when marked redeemed)">
                <RewardsEditor rewards={codeRewards} onChange={setCodeRewards} currencies={currencyRows} materials={materialRows} />
              </Field>
            </>
          )}

          {kind === "banner" && (
            <>
              <Field label="Banner name">
                <input value={bannerName} onChange={(e) => setBannerName(e.target.value)} placeholder="e.g. Alluring Shadows" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </Field>
              <Field label={`Featured character or ${interpolateLabel("{term:equipmentItem}", gameConfig.terms)} (optional)`}>
                <div className="flex gap-1.5 mb-1.5">
                  <button
                    onClick={() => setFeaturedMode("existing")}
                    className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${featuredMode === "existing" ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
                  >
                    EXISTING
                  </button>
                  <button
                    onClick={() => setFeaturedMode("new")}
                    className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${featuredMode === "new" ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
                  >
                    NEW — NOT IN MY ROSTER YET
                  </button>
                </div>

                {featuredMode === "existing" &&
                  (featured ? (
                    <div className="flex items-center gap-2 bg-white/5 border border-blue/50 rounded-md px-2.5 py-1.5 text-sm">
                      <span className="flex-1">{featured.row.name}</span>
                      <button onClick={() => setFeatured(null)} className="text-text-faint hover:text-text text-xs">
                        change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={featuredSearch}
                        onChange={(e) => setFeaturedSearch(e.target.value)}
                        placeholder="search characters and items…"
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm mb-1.5"
                      />
                      <div className="border border-white/10 rounded-md overflow-hidden bg-surface2 max-h-32 overflow-y-auto">
                        {featuredCandidates.map((c) => (
                          <button
                            key={`${c.kind}:${c.row.id}`}
                            onClick={() => setFeatured(c)}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs text-text-dim hover:bg-white/5"
                          >
                            <span className="flex-1">{c.row.name}</span>
                            <span className="font-mono text-[10px] text-text-faint">{c.kind}</span>
                          </button>
                        ))}
                        {featuredCandidates.length === 0 && <div className="px-2.5 py-2 text-xs text-text-faint">No matches.</div>}
                      </div>
                    </>
                  ))}

                {featuredMode === "new" && (
                  <div className="flex flex-col gap-1.5 border border-dashed border-white/15 rounded-md p-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setNewKind("character")}
                        className={`flex-1 text-center text-[10px] font-mono py-1 rounded border ${newKind === "character" ? "bg-blue/15 border-blue/40 text-blue" : "bg-white/5 border-white/10 text-text-dim"}`}
                      >
                        CHARACTER
                      </button>
                      <button
                        onClick={() => setNewKind("equipment")}
                        className={`flex-1 text-center text-[10px] font-mono py-1 rounded border ${newKind === "equipment" ? "bg-blue/15 border-blue/40 text-blue" : "bg-white/5 border-white/10 text-text-dim"}`}
                      >
                        {interpolateLabel("{term:equipmentItem}", gameConfig.terms).toUpperCase()}
                      </button>
                    </div>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={newRank} onChange={(e) => setNewRank(e.target.value)} placeholder="rank (optional)" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                      {newKind === "character" ? (
                        <select value={newElementSlug} onChange={(e) => setNewElementSlug(e.target.value)} className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm">
                          <option value="">element (optional)</option>
                          {elementRows.map((el) => (
                            <option key={el.slug} value={el.slug}>
                              {el.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="type (optional)" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                      )}
                    </div>
                    {newKind === "character" ? (
                      <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="role (optional)" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                    ) : (
                      <input value={newMainStat} onChange={(e) => setNewMainStat(e.target.value)} placeholder="main stat (optional)" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                    )}
                    {newKind === "character" && (
                      <input type="date" value={newReleaseDate} onChange={(e) => setNewReleaseDate(e.target.value)} placeholder="release date (optional)" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                    )}
                    <div className="font-mono text-[9px] text-text-faint">Deep-kit details (ascension material, module slots…) aren't known at announcement time — fill those in later on the Data page.</div>
                  </div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type (optional)">
                  <input value={bannerType} onChange={(e) => setBannerType(e.target.value)} placeholder="e.g. Character" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                </Field>
                <div />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start date">
                  <input type="date" value={bannerStart} onChange={(e) => setBannerStart(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                </Field>
                <Field label="End date">
                  <input type="date" value={bannerEnd} onChange={(e) => setBannerEnd(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                </Field>
              </div>
            </>
          )}

          {kind === "event" && (
            <>
              <Field label="Event name">
                <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Circle Bounty" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start date">
                  <input type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                </Field>
                <Field label="End date">
                  <input type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm" />
                </Field>
              </div>
              <Field label="Notes (optional, free text)">
                <textarea value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} rows={2} className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm resize-none" />
              </Field>
              <Field label="Rewards (optional — credited when the event is claimed)">
                <RewardsEditor rewards={eventRewards} onChange={setEventRewards} currencies={currencyRows} materials={materialRows} />
              </Field>
            </>
          )}

          {kind === "level-costs" && (
            <>
              <Field label="Applies to">
                <div className="flex gap-1.5 mb-1.5">
                  {(["character", "equipment", "skill"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => {
                        setTargetKind(k);
                        setTarget(null);
                        setTargetSearch("");
                      }}
                      className={`flex-1 text-center text-[10px] font-mono py-1.5 rounded border ${targetKind === k ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
                    >
                      {(k === "equipment" ? interpolateLabel("{term:equipmentItem}", gameConfig.terms) : k).toUpperCase()}
                    </button>
                  ))}
                </div>
                {target ? (
                  <div className="flex items-center gap-2 bg-white/5 border border-blue/50 rounded-md px-2.5 py-1.5 text-sm">
                    <span className="flex-1">{target.name}</span>
                    <button onClick={() => setTarget(null)} className="text-text-faint hover:text-text text-xs">
                      change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                      placeholder="search…"
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm mb-1.5"
                    />
                    <div className="border border-white/10 rounded-md overflow-hidden bg-surface2 max-h-32 overflow-y-auto">
                      {targetCandidates.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => setTarget(row)}
                          className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 border-b border-border2 last:border-0 text-xs text-text-dim hover:bg-white/5"
                        >
                          {row.name}
                        </button>
                      ))}
                      {targetCandidates.length === 0 && <div className="px-2.5 py-2 text-xs text-text-faint">No matches.</div>}
                    </div>
                  </>
                )}
                <div className="font-mono text-[9px] text-text-faint mt-1">Attaches cost data to an existing entry — doesn't create one. New characters/{interpolateLabel("{term:equipmentItem}", gameConfig.terms)}s come from a banner update instead.</div>
              </Field>
              <Field label="Level-up cost bands">
                <LevelCostsEditor bands={levelCostBands} onChange={setLevelCostBands} materials={materialRows} />
              </Field>
            </>
          )}

          {applied && <div className="bg-green/8 border border-green/28 rounded-md px-3 py-2 text-xs text-green">Applied to your data.</div>}
          {!canRepoContribute && (
            <div className="font-mono text-[10px] text-text-faint">Set a community data repo above to enable contributing back.</div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2 flex-wrap">
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CLOSE
          </button>
          <button onClick={contribute} disabled={!payload || !canRepoContribute} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim disabled:opacity-40">
            CONTRIBUTE TO REPO
          </button>
          <button onClick={applyLocally} disabled={!payload || applyUpdate.isPending} className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40">
            APPLY TO MY DATA
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
