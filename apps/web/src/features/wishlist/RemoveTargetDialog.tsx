import type { WishlistTargetRow } from "@grindstone/shared";

/** Screen 09's "Remove from wishlist?" confirm — REMOVE sets status "deferred" (it moves to Pull History, it isn't deleted; the target was never obtained or expired, it was proactively deprioritized). The reserved-pulls-released framing matches the mockup; the exact re-run affordability preview for the next target isn't shown here since it recomputes live the moment the removal lands (no separate before/after simulation needed). */
export function RemoveTargetDialog({
  target,
  label,
  reserved,
  onKeep,
  onRemove,
}: {
  target: WishlistTargetRow;
  label: string;
  reserved: number;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4" onClick={onKeep}>
      <div className="w-[376px] max-w-full bg-panel border border-pink/35 rounded-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border2 bg-surface2 font-display font-bold text-sm text-pink">Remove from wishlist?</div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-xs text-text-dim leading-relaxed">
            {label} is priority {target.priority}
            {target.reserveFromToday ? ` with ${reserved > 0 ? reserved : target.budgetCeilingPulls} pulls reserved` : ""}. Removing releases the reserve back to the
            general pool and moves this target to Pull History as deferred.
          </div>
          <div className="flex gap-2 font-mono text-[11px]">
            <button onClick={onRemove} className="flex-1 text-center bg-pink text-ink py-1.5 rounded">
              REMOVE
            </button>
            <button onClick={onKeep} className="flex-1 text-center bg-white/5 border border-white/10 text-text-dim py-1.5 rounded">
              KEEP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
