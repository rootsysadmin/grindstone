import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { entityConfigs, interpolateLabel } from "@grindstone/shared";
import { useActiveGame } from "../../state/gameContext.tsx";
import { useEntityList, useRankTierMap, useRankTiers } from "../master-data/api.ts";
import { RarityFrame } from "../../components/rankVisuals.tsx";
import { useGameSettings, useQuickOwnCharacter, useRoster } from "./api.ts";
import { computeBuildRing, type CharacterSkillCap } from "./buildProgress.ts";

type StateFilter = "all" | "owned" | "missing" | "under50";
type SortKey = "build" | "level" | "owned" | "resonance";

const ringColor: Record<string, string> = { amber: "#f0b44a", pink: "#e8639b", blue: "#58b7f0", purple: "#a084f5", green: "#5fd08a" };

export function RosterPage() {
  const { config: gameConfig } = useActiveGame();
  const { data: roster = [], isLoading } = useRoster();
  const { data: settings } = useGameSettings();
  const { data: elements = [] } = useEntityList(entityConfigs.elements);
  const { data: allSkills = [] } = useEntityList(entityConfigs.skills);
  const rankTiers = useRankTiers();
  const rankTierMap = useRankTierMap();
  const quickOwn = useQuickOwnCharacter();

  const [search, setSearch] = useState("");
  const [elementFilter, setElementFilter] = useState<number | null>(null);
  const [rankFilter, setRankFilter] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("build");

  // Fallbacks only cover the instant before /settings resolves (same-origin,
  // near-instant) — real values always come from the DB row.
  const caps = {
    maxCharacterLevel: settings?.maxCharacterLevel ?? 1,
    maxResonanceLevel: settings?.maxResonanceLevel ?? 1,
    maxSkillLevel: settings?.maxSkillLevel ?? 1,
    maxEquipmentLevel: settings?.maxEquipmentLevel ?? 1,
  };

  const skillsByCharacter = useMemo(() => {
    const map = new Map<number, CharacterSkillCap[]>();
    for (const s of allSkills) {
      const charId = s.characterId as number | null;
      if (charId == null) continue;
      const cap: CharacterSkillCap = { id: s.id as number, maxLevel: (s.maxLevel as number | null) ?? null };
      map.set(charId, [...(map.get(charId) ?? []), cap]);
    }
    return map;
  }, [allSkills]);

  const rows = useMemo(
    () => roster.map((entry) => ({ entry, ring: computeBuildRing(entry, caps, skillsByCharacter.get(entry.character.id) ?? []) })),
    [roster, skillsByCharacter, caps],
  );

  const elementCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const { entry } of rows) {
      if (!entry.build || entry.character.elementId === null) continue;
      counts.set(entry.character.elementId, (counts.get(entry.character.elementId) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  // rankTiers is one shared per-game table now (also used by materials/equipment/currencies),
  // so the roster's rank filter can't just list every tier — it needs to narrow down to
  // tiers actually used by a character, not show unrelated material tiers alongside them.
  const characterRankTiers = useMemo(() => {
    const ids = new Set(rows.map((r) => r.entry.character.rankTierId).filter((id): id is number => id !== null));
    return rankTiers.filter((t) => ids.has(t.id as number));
  }, [rows, rankTiers]);

  const rankCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const { entry } of rows) {
      if (!entry.build || entry.character.rankTierId === null) continue;
      counts.set(entry.character.rankTierId, (counts.get(entry.character.rankTierId) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  let filtered = rows.filter(({ entry }) => {
    if (search && !entry.character.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (elementFilter !== null && entry.character.elementId !== elementFilter) return false;
    if (rankFilter !== null && entry.character.rankTierId !== rankFilter) return false;
    if (stateFilter === "owned" && !entry.build) return false;
    if (stateFilter === "missing" && entry.build) return false;
    return true;
  });
  if (stateFilter === "under50") filtered = filtered.filter(({ entry, ring }) => entry.build && ring.overall < 50);

  filtered = [...filtered].sort((a, b) => {
    if (sortKey === "level") return (b.entry.build?.level ?? -1) - (a.entry.build?.level ?? -1);
    if (sortKey === "owned") return (b.entry.build?.ownedAt ?? 0) - (a.entry.build?.ownedAt ?? 0);
    if (sortKey === "resonance") return (b.entry.build?.resonanceLevel ?? -1) - (a.entry.build?.resonanceLevel ?? -1);
    return b.ring.overall - a.ring.overall;
  });

  const ownedRows = rows.filter((r) => r.entry.build);
  const avgBuild = ownedRows.length > 0 ? Math.round(ownedRows.reduce((a, r) => a + r.ring.overall, 0) / ownedRows.length) : 0;

  const elementName = (id: number | null) => elements.find((e) => e.id === id)?.name ?? null;

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="font-display font-bold text-lg">Roster</h1>
        <span className="font-mono text-xs text-text-faint">avg build {avgBuild}%</span>
        <div className="flex-1" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search roster"
          className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs font-mono w-52 outline-none focus:border-blue/50"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono"
        >
          <option value="build">SORT: BUILD %</option>
          <option value="level">SORT: LEVEL</option>
          <option value="owned">SORT: DATE ACQUIRED</option>
          <option value="resonance">SORT: {interpolateLabel("{term:resonanceLevel}", gameConfig.terms).toUpperCase()}</option>
        </select>
      </div>

      <div className="p-3 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-[172px_1fr] gap-3 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-border2 font-mono text-[10px] tracking-wide text-text-faint">ELEMENT</div>
            <div className="flex flex-col">
              <button
                onClick={() => setElementFilter(null)}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border2 text-left ${elementFilter === null ? "text-amber" : "text-text-dim"}`}
              >
                <span className="flex-1">All</span>
              </button>
              {elements.map((el) => (
                <button
                  key={el.id}
                  onClick={() => setElementFilter(elementFilter === el.id ? null : el.id)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border2 last:border-0 text-left ${elementFilter === el.id ? "text-amber bg-amber/5" : "text-text-dim"}`}
                >
                  <span className="flex-1">{el.name}</span>
                  <span className="font-mono text-[10px] text-text-faint">{elementCounts.get(el.id as number) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-border2 font-mono text-[10px] tracking-wide text-text-faint">RANK</div>
            <div className="p-2 flex gap-1.5">
              {characterRankTiers.map((tier) => {
                const id = tier.id as number;
                const active = rankFilter === id;
                return (
                  <button
                    key={id}
                    onClick={() => setRankFilter(active ? null : id)}
                    className={`flex-1 text-center font-mono text-xs py-1 rounded border ${active ? "" : "text-text-dim"}`}
                    style={active ? { color: String(tier.color), borderColor: String(tier.color), background: "rgba(255,255,255,.05)" } : { borderColor: "rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)" }}
                  >
                    {tier.name} <span className="text-text-faint">{rankCounts.get(id) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-border2 font-mono text-[10px] tracking-wide text-text-faint">BUILD STATE</div>
            <div className="flex flex-col">
              {([
                ["all", "All"],
                ["owned", "Owned"],
                ["missing", "Missing"],
                ["under50", "Under 50%"],
              ] as [StateFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStateFilter(key)}
                  className={`text-left px-2.5 py-1.5 text-xs border-b border-border2 last:border-0 ${stateFilter === key ? "text-amber" : "text-text-dim"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {isLoading && <div className="text-text-dim text-sm">Loading…</div>}
          {!isLoading && filtered.length === 0 && <div className="text-text-faint text-sm">No characters match.</div>}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
            {filtered.map(({ entry, ring }) => {
              const owned = Boolean(entry.build);
              return (
                <Link
                  key={entry.character.id}
                  to={`/roster/${entry.character.id}`}
                  className={`group relative bg-surface border rounded-lg overflow-hidden ${owned ? "border-white/10" : "border-dashed border-white/10 opacity-55"}`}
                >
                  {!owned && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        quickOwn.mutate(entry.character.id);
                      }}
                      className="absolute top-1 right-1 z-10 font-mono text-[9px] bg-amber text-ink font-medium px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      + OWN
                    </button>
                  )}
                  <RarityFrame tier={rankTierMap.get(entry.character.rankTierId as number) ?? null} className="aspect-square relative bg-surface2">
                    {entry.character.imageUrl ? (
                      <img src={entry.character.imageUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center">
                        {!owned && <span className="font-mono text-[9px] text-text-faint">NOT OWNED</span>}
                      </div>
                    )}
                    {owned && entry.build && (
                      <>
                        <span className="absolute top-1 left-1 font-mono text-[8px] bg-black/50 text-amber px-1 py-0.5 rounded">
                          S{entry.build.resonanceLevel}
                        </span>
                        <span className="absolute bottom-1 right-1 font-mono text-[9px] text-amber">{ring.overall}%</span>
                      </>
                    )}
                  </RarityFrame>
                  <div className="px-2 py-1.5">
                    <div className="font-display font-semibold text-xs truncate">{entry.character.name}</div>
                    <div className="font-mono text-[9px] text-text-faint mt-0.5 truncate">
                      {owned && entry.build ? `Lv ${entry.build.level} · ${elementName(entry.character.elementId) ?? "—"}` : elementName(entry.character.elementId) ?? "—"}
                    </div>
                    {owned && (
                      <div className="h-[3px] rounded bg-white/10 mt-1.5">
                        <div className="h-full rounded" style={{ width: `${ring.overall}%`, background: ringColor.amber }} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
