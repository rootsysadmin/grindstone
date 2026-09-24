import { useState } from "react";

/** Asks for the duplicate's final name up front, instead of creating it as "<name> (copy)" and relying on a later rename — that round-trip left the row's slug (and therefore its matched image) stuck on the "(copy)" name, since nothing recomputes slug from a plain name edit that doesn't also change slug. Prefilled with the "(copy)" suggestion so the common case is still just hitting enter. */
export function DuplicateRowDialog({
  sourceName,
  busy,
  onCancel,
  onConfirm,
}: {
  sourceName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(`${sourceName} (copy)`);
  const trimmed = name.trim();

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="w-[376px] max-w-full bg-panel border border-white/10 rounded-lg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border2 bg-surface2 font-display font-bold text-sm">
          Duplicate "{sourceName}"
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Name</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmed && !busy) onConfirm(trimmed);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-blue/50"
            />
          </div>
          <div className="flex gap-2 font-mono text-[11px]">
            <button
              onClick={() => trimmed && onConfirm(trimmed)}
              disabled={!trimmed || busy}
              className="flex-1 text-center bg-amber text-ink py-1.5 rounded disabled:opacity-40"
            >
              {busy ? "DUPLICATING…" : "DUPLICATE"}
            </button>
            <button onClick={onCancel} className="flex-1 text-center bg-white/5 border border-white/10 text-text-dim py-1.5 rounded">
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
