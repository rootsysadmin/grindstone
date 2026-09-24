import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { FiftyFiftyResult, PullLogItemType, PullLogRow } from "@grindstone/shared";
import { useEntityList, useRankTierMap, useRankTiers } from "../master-data/api.ts";
import { useCreatePullLogEntry, useDeletePullLogEntry, usePityState, useUpdatePullLogEntry } from "./api.ts";
import { poolKeyForBanner, type BannerLite } from "./pityView.ts";

const todayIso = () => new Date().toISOString().slice(0, 10);

// A native <select>'s option popup renders as its own layer outside the
// page's DOM, so a translucent bg-white/5 (fine for the closed control)
// composites against opaque OS chrome instead and turns near-white
// regardless of theme.css's color-scheme:dark — see docs/progress.md's
// "dropdown contrast" follow-up. Every <select> needs a solid background.
const selectCls = "w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm";

/** Screen 09's "log a pull manually" dialog — also doubles as the edit form when `entry` is passed (opened from a log row's edit button). */
export function LogPullDialog({ entry, onClose }: { entry?: PullLogRow; onClose: () => void }) {
  const { data: bannerRows = [] } = useEntityList(entityConfigs.banners);
  const { data: characters = [] } = useEntityList(entityConfigs.characters);
  const { data: equipmentItems = [] } = useEntityList(entityConfigs.equipmentItems);
  const { data: pools = [] } = usePityState();
  const rankTiers = useRankTiers(); // ascending by level: index 0 = weakest, last = strongest
  const rankTierMap = useRankTierMap();
  const create = useCreatePullLogEntry();
  const update = useUpdatePullLogEntry();
  const remove = useDeletePullLogEntry();
  const topRank = rankTiers[rankTiers.length - 1]?.name;
  const isEditing = entry != null;

  const [bannerId, setBannerId] = useState<number | null>(
    entry?.bannerId ?? ((bannerRows[0]?.id as number | undefined) ?? null),
  );
  const [itemType, setItemType] = useState<PullLogItemType>(entry?.itemType ?? "character");
  const [itemId, setItemId] = useState<number | null>(entry?.itemId ?? null);
  const [itemName, setItemName] = useState(entry?.itemName ?? "");
  const [rank, setRank] = useState<string>(entry?.rank ?? rankTiers[0]?.name ?? "");
  const [quantity, setQuantity] = useState(entry?.quantity ?? 1);
  const [pityAtPull, setPityAtPull] = useState(entry?.pityAtPull != null ? String(entry.pityAtPull) : "");
  const [fiftyFiftyResult, setFiftyFiftyResult] = useState<FiftyFiftyResult>(entry?.fiftyFiftyResult ?? "n/a");
  const [pulledAt, setPulledAt] = useState(entry?.pulledAt ?? todayIso());
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const banner = bannerRows.find((b) => b.id === bannerId);
  const bannerTracksFiftyFifty = Boolean(banner?.fiftyFifty);

  // "Pulls since last <top rank>" is a per-pull count (how many pulls THIS
  // one took), not the banner's fixed hard-pity cap — those can look
  // similar but aren't the same number, which is exactly what confused the
  // user into thinking this field should always read the cap. Suggest it
  // from the pool's already-computed running pity (+1 for this pull) so
  // the common case is "confirm the number," not "count it yourself."
  function pityCapAndSuggestion(id: number | null): { cap: number | null; suggestion: number | null } {
    const row = bannerRows.find((b) => b.id === id);
    if (!row) return { cap: null, suggestion: null };
    const lite: BannerLite = {
      id: row.id as number,
      name: row.name,
      type: (row.type as string | null) ?? null,
      carriesPity: Boolean(row.carriesPity),
      fiftyFifty: Boolean(row.fiftyFifty),
      pity: (row.pity as number | null) ?? null,
    };
    const pool = pools.find((p) => p.poolKey === poolKeyForBanner(lite));
    return { cap: lite.pity, suggestion: pool ? pool.currentPity + 1 : null };
  }

  const { cap: pityCap } = pityCapAndSuggestion(bannerId);

  // Fill in the suggestion for the dialog's initial default banner once
  // banner/pool data has loaded (may take a render or two) — runs after
  // every render, guarded by the ref, until it succeeds exactly once, so it
  // never fights a manual edit afterward. Picking a *different* banner
  // refreshes the suggestion directly in that select's onChange instead.
  // Skipped entirely when editing — the entry's own historical pity value
  // shouldn't be silently replaced by a freshly computed "current" one.
  const autofilledRef = useRef(isEditing);
  useEffect(() => {
    if (autofilledRef.current || bannerId == null) return;
    const { suggestion } = pityCapAndSuggestion(bannerId);
    if (suggestion == null) return;
    setPityAtPull(String(suggestion));
    autofilledRef.current = true;
  });

  const pickList = itemType === "character" ? characters : itemType === "equipment" ? equipmentItems : [];

  const canSubmit = bannerId != null && itemName.trim().length > 0;

  function pickEntity(id: number) {
    const row = pickList.find((r) => r.id === id);
    if (!row) return;
    setItemId(id);
    setItemName(row.name);
    setRank(rankTierMap.get(row.rankTierId as number)?.name ?? "");
  }

  function submit() {
    if (!canSubmit || bannerId == null) return;
    const body = {
      bannerId,
      rank: rank || null,
      itemType,
      itemId: itemType === "other" ? null : itemId,
      itemName: itemName.trim(),
      quantity,
      pityAtPull: pityAtPull.trim() ? Number(pityAtPull) : null,
      fiftyFiftyResult: bannerTracksFiftyFifty ? fiftyFiftyResult : null,
      pulledAt,
      notes: notes.trim() || null,
    };
    if (entry) {
      update.mutate({ id: entry.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  }

  function handleDelete() {
    if (!entry) return;
    remove.mutate(entry.id, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-[440px] max-w-full bg-panel border border-white/10 rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="font-display font-bold text-sm">{isEditing ? "Edit pull" : "Log a pull manually"}</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Banner">
            <select
              value={bannerId ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setBannerId(id);
                autofilledRef.current = true; // this explicit refresh replaces the mount-time autofill
                const { suggestion } = pityCapAndSuggestion(id);
                setPityAtPull(suggestion != null ? String(suggestion) : "");
              }}
              className={selectCls}
            >
              {bannerRows.map((b) => (
                <option key={b.id} value={b.id as number}>
                  {b.name} · {String(b.type)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Item type">
            <div className="flex gap-1.5">
              {(["character", "equipment", "other"] as PullLogItemType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setItemType(t);
                    setItemId(null);
                    setItemName("");
                    setRank(t === "other" ? rankTiers[0]?.name ?? "" : "");
                  }}
                  className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                    itemType === t ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {itemType === "other" ? (
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field label="Name">
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. B-rank fodder"
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Qty">
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
                />
              </Field>
            </div>
          ) : (
            <Field label="Item">
              <select
                value={itemId ?? ""}
                onChange={(e) => pickEntity(Number(e.target.value))}
                className={selectCls}
              >
                <option value="" disabled>
                  Select…
                </option>
                {pickList.map((row) => (
                  <option key={row.id} value={row.id as number}>
                    {row.name} ({rankTierMap.get(row.rankTierId as number)?.name ?? "?"})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Rank">
              {itemType === "other" ? (
                <select
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  className={selectCls}
                >
                  {rankTiers.map((t) => (
                    <option key={t.slug} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-text-dim">{rank || "—"}</div>
              )}
            </Field>
            <Field label={`Pulls since last ${topRank ?? "top rank"}`}>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={pityAtPull}
                  onChange={(e) => setPityAtPull(e.target.value)}
                  placeholder="—"
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-center"
                />
                <span className="font-mono text-[10px] text-text-faint whitespace-nowrap">/ {pityCap ?? "?"} cap</span>
              </div>
              <div className="font-mono text-[9px] text-text-faint mt-1 leading-relaxed">
                How many pulls this one took — not the cap. Pre-filled from your logged pulls; can be lower if you won it early.
              </div>
            </Field>
          </div>

          {bannerTracksFiftyFifty && (
            <Field label="50/50 outcome">
              <div className="flex gap-1.5">
                {(["won", "lost", "n/a"] as FiftyFiftyResult[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setFiftyFiftyResult(r)}
                    className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded border ${
                      fiftyFiftyResult === r
                        ? "bg-pink/15 border-pink/50 text-pink"
                        : "bg-white/5 border-white/10 text-text-dim"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="When">
            <input
              type="date"
              value={pulledAt}
              onChange={(e) => setPulledAt(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border2 bg-surface2">
          {isEditing && (
            <button
              onClick={handleDelete}
              disabled={remove.isPending}
              className="text-[11px] font-mono px-3 py-1.5 rounded bg-pink/10 border border-pink/30 text-pink disabled:opacity-40"
            >
              DELETE
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-[11px] font-mono px-3 py-1.5 rounded bg-white/5 border border-white/10 text-text-dim">
            CANCEL
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || create.isPending || update.isPending}
            className="text-[11px] font-mono px-3 py-1.5 rounded bg-amber text-ink disabled:opacity-40"
          >
            {isEditing ? "SAVE" : "LOG PULL"}
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
