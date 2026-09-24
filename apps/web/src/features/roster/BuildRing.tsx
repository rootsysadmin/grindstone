import type { RingResult } from "./buildProgress.ts";

const colorHex: Record<string, string> = { amber: "#f0b44a", pink: "#e8639b", blue: "#58b7f0", purple: "#a084f5", green: "#5fd08a" };

/** The donut + per-segment breakdown list from mockup screen 02's build card. */
export function BuildRing({ ring }: { ring: RingResult }) {
  return (
    <div className="bg-surface border border-border2 rounded-lg p-3 flex flex-col gap-2.5 items-center">
      <div
        className="w-[118px] h-[118px] rounded-full grid place-items-center"
        style={{ background: `conic-gradient(#f0b44a 0turn ${ring.overall / 100}turn, rgba(255,255,255,.08) ${ring.overall / 100}turn 1turn)` }}
      >
        <div className="w-24 h-24 rounded-full bg-surface flex flex-col items-center justify-center gap-0.5">
          <span className="font-display font-bold text-3xl text-amber leading-none">{ring.overall}</span>
          <span className="font-mono text-[9px] text-text-dim tracking-widest">BUILT</span>
        </div>
      </div>
      <div className="w-full flex flex-col gap-1.5">
        {ring.segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-sm" style={{ background: colorHex[s.color] }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-mono text-[11px]" style={{ color: s.fraction === null ? undefined : s.fraction >= 1 ? "#5fd08a" : undefined }}>
              {s.fraction === null ? "— n/a" : `${Math.round(s.fraction * 100)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
