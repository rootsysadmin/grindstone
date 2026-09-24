/** target=1 renders a checkbox; target>1 renders a +/- stepper with an "N/target" readout — same shape as the game-dailies checkbox and the "Hunter's Crucible 3/5" weekly count. */
export function TaskProgressControl({
  target,
  current,
  onChange,
}: {
  target: number;
  current: number;
  onChange: (next: number) => void;
}) {
  if (target <= 1) {
    return (
      <button
        onClick={() => onChange(current >= 1 ? 0 : 1)}
        className={`w-[15px] h-[15px] rounded-[3px] flex-none grid place-items-center text-[9px] font-bold ${
          current >= 1 ? "bg-green text-ink" : "border border-white/20"
        }`}
      >
        {current >= 1 ? "✓" : ""}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-none">
      <button
        onClick={() => onChange(Math.max(0, current - 1))}
        className="w-5 h-5 rounded bg-white/5 border border-white/10 text-text-dim text-xs leading-none"
      >
        −
      </button>
      <span className="font-mono text-[11px] w-10 text-center">
        {current}/{target}
      </span>
      <button
        onClick={() => onChange(Math.min(target, current + 1))}
        className="w-5 h-5 rounded bg-white/5 border border-white/10 text-text-dim text-xs leading-none"
      >
        +
      </button>
    </div>
  );
}
