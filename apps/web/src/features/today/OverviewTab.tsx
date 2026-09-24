import { useMemo, useState } from "react";
import { entityConfigs, type MasterDataRow, type RedeemCodeRow } from "@grindstone/shared";
import { useEntityList, useRankTiers } from "../master-data/api.ts";
import { useGameSettings, usePinCharacter, useRoster } from "../roster/api.ts";
import { computeBuildRing, type CharacterSkillCap } from "../roster/buildProgress.ts";
import { useIncomeClaims, useIncomeSources, useInventory } from "../planner/api.ts";
import { usePityState, usePullLog } from "../pull-log/api.ts";
import { poolLabel } from "../pull-log/pityView.ts";
import { RankBadge } from "../../components/rankVisuals.tsx";
import {
  useCreateRedeemCode,
  useEventProgress,
  useEventRewards,
  useRedeemCodes,
  useSetEventProgress,
  useTasks,
  useTaskProgress,
  useUpdateRedeemCode,
  useUpdateTaskProgress,
} from "./api.ts";
import { TaskProgressControl } from "./TaskProgressControl.tsx";
import { currentPeriodKey, isDone, progressFor } from "./taskStats.ts";
import { computeRunway } from "./runway.ts";
import { SourceBadge } from "../master-data/Badges.tsx";
import { useRunCommunitySync, useSyncStatus } from "../sync/api.ts";

const RING_COLOR = "#f0b44a";

function timeAgo(unixSeconds: number): string {
  const hours = Math.floor((Date.now() / 1000 - unixSeconds) / 3600);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Prefers a real string derived from a code's structured rewards (same join calendarData.ts's buildEventEntries already does for events) over the free-text rewardLabel — a code only has the latter when it was added through the compact quick-add form, which has no structured rewards to derive from. */
function codeRewardLabel(c: RedeemCodeRow, currencyById: Map<number, MasterDataRow>, materialById: Map<number, MasterDataRow>): string | null {
  if (c.rewards.length > 0) {
    return c.rewards
      .map((r) => {
        const name = r.kind === "currency" ? currencyById.get(r.currencyId ?? -1)?.name : materialById.get(r.materialId ?? -1)?.name;
        return `${r.quantity ?? "?"} ${name ?? "?"}`;
      })
      .join(", ");
  }
  return c.rewardLabel;
}

function BuildRing({ percent, size = 44 }: { percent: number; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(${RING_COLOR} 0% ${percent}%, rgba(255,255,255,.09) ${percent}% 100%)`,
      }}
      className="grid place-items-center flex-none"
    >
      <div className="rounded-full bg-surface2 grid place-items-center font-mono text-[11px]" style={{ width: size - 10, height: size - 10, color: RING_COLOR }}>
        {percent}
      </div>
    </div>
  );
}

export function OverviewTab() {
  const rankTiers = useRankTiers();
  const rankTierByName = new Map(rankTiers.map((t) => [t.name, { name: t.name, color: String(t.color) }]));
  const { data: tasks = [] } = useTasks();
  const { data: progress = [] } = useTaskProgress();
  const updateProgress = useUpdateTaskProgress();

  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: eventRows = [] } = useEntityList(entityConfigs.events);
  const { data: currencyRows = [] } = useEntityList(entityConfigs.currencies);
  const { data: materialRows = [] } = useEntityList(entityConfigs.materials);
  const { data: eventProgressRows = [] } = useEventProgress();
  const { data: eventRewardRows = [] } = useEventRewards();

  const { data: roster = [] } = useRoster();
  const { data: settings } = useGameSettings();
  const { data: allSkills = [] } = useEntityList(entityConfigs.skills);
  const pinCharacter = usePinCharacter();

  const { data: pools = [] } = usePityState();
  const { data: pulls = [] } = usePullLog();
  const { data: inventory } = useInventory();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: claims = [] } = useIncomeClaims();
  const { data: codes = [] } = useRedeemCodes();
  const createCode = useCreateRedeemCode();
  const updateCode = useUpdateRedeemCode();
  const setEventProgress = useSetEventProgress();
  const { data: syncStatus } = useSyncStatus();
  const runSync = useRunCommunitySync();

  const [showPinPicker, setShowPinPicker] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newCodeReward, setNewCodeReward] = useState("");

  // --- dailies/weeklies mini cards ---
  const gameDailies = tasks.filter((t) => t.cadence === "daily" && t.fromGame);
  const dailyDone = gameDailies.filter((t) => isDone(t, progressFor(t.id, currentPeriodKey("daily"), progress))).length;
  const weeklyTasks = tasks.filter((t) => t.cadence === "weekly");

  // --- ending soon / runway ---
  const runway = useMemo(
    () => computeRunway(bannerRows, currencyRows, inventory?.currencies ?? [], incomeSources, claims, 21),
    [bannerRows, currencyRows, inventory, incomeSources, claims],
  );

  // --- events expiring ---
  // Completion target is stageCount if set, else 1 (a plain "claim" checkbox) when there's a real reward attached —
  // an event with neither has nothing to log, so it's shown as always-done rather than perpetually 0%. See calendarData.ts's buildEventEntries for the same rule on the Calendar side.
  const eventsExpiring = eventRows
    .map((e) => {
      const stageCount = (e.stageCount as number | null) ?? null;
      const hasReward = eventRewardRows.some((r) => r.eventId === e.id);
      return {
        event: e,
        target: stageCount ?? (hasReward ? 1 : null),
        progressRow: eventProgressRows.find((p) => p.eventId === e.id),
        days: e.endDate ? Math.ceil((new Date(e.endDate as string).getTime() - Date.now()) / 86400000) : null,
      };
    })
    .filter((r) => r.days !== null && r.days >= 0)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 6);

  // --- roster build progress ---
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
      map.set(charId, [...(map.get(charId) ?? []), { id: s.id as number, maxLevel: (s.maxLevel as number | null) ?? null }]);
    }
    return map;
  }, [allSkills]);
  const ownedRoster = roster.filter((r) => r.build);
  const pinned = ownedRoster.filter((r) => r.build?.pinned);
  const unpinned = ownedRoster.filter((r) => !r.build?.pinned);

  // --- pity summary ---
  const bannerById = new Map(bannerRows.map((b) => [b.id as number, b]));
  const currencyById = new Map(currencyRows.map((c) => [c.id as number, c]));
  const materialById = new Map(materialRows.map((m) => [m.id as number, m]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_292px] gap-3">
      {/* col 1 */}
      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Dailies</span>
            <span className="font-mono text-[10px] text-text-faint">
              {dailyDone} / {gameDailies.length}
            </span>
          </div>
          <div className="flex flex-col">
            {gameDailies.length === 0 && <div className="p-3 text-xs text-text-faint">None added.</div>}
            {gameDailies.map((t) => {
              const current = progressFor(t.id, currentPeriodKey("daily"), progress);
              return (
                <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <TaskProgressControl
                    target={t.target}
                    current={current}
                    onChange={(n) => updateProgress.mutate({ id: t.id, periodKey: currentPeriodKey("daily"), current: n })}
                  />
                  <span className={`flex-1 ${isDone(t, current) ? "text-text-faint line-through" : ""}`}>{t.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Weeklies</div>
          <div className="p-2.5 flex flex-col gap-2">
            {weeklyTasks.length === 0 && <div className="text-xs text-text-faint">None added.</div>}
            {weeklyTasks.map((t) => {
              const current = progressFor(t.id, currentPeriodKey("weekly"), progress);
              return (
                <div key={t.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{t.label}</span>
                    <span className="font-mono text-[11px] text-text-dim">
                      {current}/{t.target}
                    </span>
                  </div>
                  <div className="h-1 rounded bg-white/10">
                    <div
                      className={`h-full rounded ${isDone(t, current) ? "bg-green" : "bg-purple"}`}
                      style={{ width: `${Math.min(100, (current / t.target) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* col 2 */}
      <div className="flex flex-col gap-3 min-w-0">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Ending Soon</div>
          {runway.length === 0 ? (
            <div className="p-3 text-xs text-text-faint">No banners ending in the next 3 weeks.</div>
          ) : (
            runway.slice(0, 3).map((r) => (
              <div key={r.bannerId} className="flex items-center gap-3 px-3 py-2 border-b border-border2 last:border-0 text-xs">
                <span className="flex-1">{r.bannerName}</span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-pink/10 border border-pink/30 text-pink">{r.daysUntilEnd}d</span>
                <span className="font-mono text-[11px] text-text-dim">
                  {r.pullsNow ?? "—"} pulls now{r.pullsByEnd != null && r.pullsByEnd !== r.pullsNow ? ` → ${r.pullsByEnd}` : ""}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Events Expiring</span>
            <span className="font-mono text-[10px] text-text-faint">{eventsExpiring.length} tracked</span>
          </div>
          <div className="flex flex-col">
            {eventsExpiring.length === 0 && <div className="p-3 text-xs text-text-faint">Nothing expiring soon.</div>}
            {eventsExpiring.map(({ event, target, progressRow, days }) => {
              const current = progressRow?.current ?? 0;
              const done = target == null || current >= target;
              return (
                <div key={event.id} className="grid grid-cols-[1fr_70px_1fr_84px] gap-2 items-center px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                  <span>{event.name}</span>
                  <span className={`font-mono text-[11px] ${done ? "text-green" : (days ?? 99) <= 3 ? "text-pink" : "text-text-dim"}`}>{days}d</span>
                  <div className="h-1 rounded bg-white/10">
                    <div
                      className={`h-full rounded ${done ? "bg-green" : "bg-blue"}`}
                      style={{ width: target != null ? `${Math.min(100, (current / target) * 100)}%` : "100%" }}
                    />
                  </div>
                  {target != null ? (
                    <div className="flex justify-end">
                      <TaskProgressControl target={target} current={current} onChange={(next) => setEventProgress.mutate({ eventId: event.id, current: next })} />
                    </div>
                  ) : (
                    <span className="font-mono text-[11px] text-right text-text-faint">not tracked</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Roster · Build Progress</span>
            <span className="font-mono text-[10px] text-text-faint">
              {ownedRoster.length} owned · {pinned.length} pinned
            </span>
          </div>
          <div className="p-2.5 grid grid-cols-6 gap-2">
            {pinned.map((entry) => {
              const ring = computeBuildRing(entry, caps, skillsByCharacter.get(entry.character.id) ?? []);
              return (
                <div key={entry.character.id} className="bg-surface2 border border-white/10 rounded-md p-2 flex flex-col items-center gap-1.5">
                  <BuildRing percent={ring.overall} />
                  <div className="font-display font-semibold text-[11px] truncate w-full text-center">{entry.character.name}</div>
                  <button
                    onClick={() => pinCharacter.mutate({ characterId: entry.character.id, pinned: false })}
                    className="font-mono text-[8px] text-text-faint hover:text-pink"
                  >
                    unpin
                  </button>
                </div>
              );
            })}
            <div className="bg-surface2 border border-dashed border-white/15 rounded-md p-2 flex flex-col items-center justify-center gap-1 relative">
              <button onClick={() => setShowPinPicker((v) => !v)} className="text-text-faint text-lg leading-none">
                +
              </button>
              <span className="font-mono text-[9px] text-text-faint">pin more</span>
              {showPinPicker && (
                <select
                  autoFocus
                  onChange={(e) => {
                    pinCharacter.mutate({ characterId: Number(e.target.value), pinned: true });
                    setShowPinPicker(false);
                  }}
                  className="absolute top-full left-0 mt-1 z-10 bg-surface border border-white/10 rounded text-[10px] w-40"
                >
                  <option value="">select…</option>
                  {unpinned.map((entry) => (
                    <option key={entry.character.id} value={entry.character.id}>
                      {entry.character.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* col 3 */}
      <div className="flex flex-col gap-3">
        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Pity</div>
          <div className="p-2.5 flex flex-col gap-2.5">
            {pools.length === 0 && <div className="text-xs text-text-faint">No banners tracked yet.</div>}
            {pools.map((p) => {
              const banner = bannerById.get(p.bannerIds[0] ?? -1);
              const cap = (banner?.pity as number | null) ?? null;
              const guaranteeText =
                p.guaranteed === true ? "GUARANTEED NEXT" : p.guaranteed === false ? "50/50 LOST" : null;
              return (
                <div key={p.poolKey}>
                  <div className="flex justify-between items-baseline text-xs mb-1">
                    <span>{poolLabel(p)}</span>
                    <span className="font-mono text-[11px]">
                      {p.currentPity} {cap != null ? `/ ${cap}` : ""}
                    </span>
                  </div>
                  <div className="h-[6px] rounded bg-white/10">
                    {cap != null && (
                      <div className="h-full rounded bg-amber" style={{ width: `${Math.min(100, (p.currentPity / cap) * 100)}%` }} />
                    )}
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-text-faint mt-1">
                    <span>{cap != null ? `${Math.max(0, cap - p.currentPity)} to cap` : ""}</span>
                    {guaranteeText && <span className={guaranteeText.includes("GUARANTEED") ? "text-green" : "text-pink"}>{guaranteeText}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border2 font-mono text-[10px] uppercase tracking-wide text-text-dim">Last Pulls</div>
          <div className="flex flex-col">
            {pulls.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border2 last:border-0 text-xs">
                <RankBadge tier={rankTierByName.get(p.rank ?? "") ?? null} />
                <span className="flex-1 truncate">
                  {p.itemName}
                  {p.quantity > 1 && <span className="text-text-faint"> ×{p.quantity}</span>}
                </span>
                <span className="font-mono text-[10px] text-text-faint">{p.pulledAt}</span>
              </div>
            ))}
            {pulls.length === 0 && <div className="p-3 text-xs text-text-faint">No pulls logged yet.</div>}
          </div>
        </div>

        <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border2 gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Codes</span>
            <div className="flex items-center gap-1.5">
              {codes.filter((c) => !c.redeemed).length > 0 && (
                <span className="font-mono text-[9px] bg-green text-ink px-1.5 py-0.5 rounded">{codes.filter((c) => !c.redeemed).length} UNREDEEMED</span>
              )}
              <button
                onClick={() => runSync.mutate()}
                disabled={runSync.isPending}
                title={syncStatus?.lastRun ? `last synced ${timeAgo(syncStatus.lastRun.createdAt)}` : "never synced"}
                className="font-mono text-[9px] text-text-faint hover:text-text px-1.5 py-0.5 rounded border border-white/10 disabled:opacity-40"
              >
                ⟳ SYNC
              </button>
            </div>
          </div>
          <div className="flex flex-col">
            {codes.slice(0, 4).map((c) => (
              <button
                key={c.id}
                onClick={() => updateCode.mutate({ id: c.id, body: { redeemed: !c.redeemed } })}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-border2 last:border-0 text-xs text-left"
              >
                {c.source === "auto" && <SourceBadge source="auto" />}
                <span className={`flex-1 font-mono ${c.redeemed ? "text-text-faint line-through" : "text-amber"}`}>{c.code}</span>
                <span className={`text-[11px] ${c.redeemed ? "text-green" : "text-text-faint"}`}>{c.redeemed ? "redeemed" : codeRewardLabel(c, currencyById, materialById)}</span>
              </button>
            ))}
            {codes.length === 0 && <div className="p-3 text-xs text-text-faint">No codes yet.</div>}
            <div className="flex gap-1.5 p-2">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="code"
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[11px] font-mono"
              />
              <input
                value={newCodeReward}
                onChange={(e) => setNewCodeReward(e.target.value)}
                placeholder="reward"
                className="w-20 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[11px]"
              />
              <button
                onClick={() => {
                  if (!newCode.trim()) return;
                  createCode.mutate({ code: newCode.trim(), rewardLabel: newCodeReward.trim() || null });
                  setNewCode("");
                  setNewCodeReward("");
                }}
                className="text-[11px] font-mono px-2 rounded bg-amber text-ink"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
