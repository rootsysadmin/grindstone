import { useState } from "react";

export interface Substat {
  stat: string;
  value: string;
}

export function parseSubstats(json: string | null): Substat[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Chip-list editor for a Cartridge/Module's {stat, value}[] substats —
 * shared by moduleTargets (an ideal to farm toward) and ownedAugments (a
 * real roll), both of which store the identical JSON shape distinct from
 * their own main-stat field. Cross-feature (master-data + roster), so it
 * lives in components/, not either feature folder.
 */
export function SubstatsEditor({ substats, onChange }: { substats: string | null; onChange: (next: Substat[]) => void }) {
  const parsed = parseSubstats(substats);
  const [newStat, setNewStat] = useState("");
  const [newValue, setNewValue] = useState("");

  return (
    <div className="flex flex-wrap gap-1.5">
      {parsed.map((s, i) => (
        <span
          key={i}
          className="flex items-center gap-1.5 bg-blue/10 border border-blue/30 text-blue px-2 py-1 rounded-md font-mono text-[11px]"
        >
          {s.stat}: {s.value}
          <button onClick={() => onChange(parsed.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
            ✕
          </button>
        </span>
      ))}
      <input
        value={newStat}
        onChange={(e) => setNewStat(e.target.value)}
        placeholder="stat"
        className="w-20 bg-surface border border-dashed border-white/15 rounded px-1.5 py-1 text-[11px]"
      />
      <input
        value={newValue}
        onChange={(e) => setNewValue(e.target.value)}
        placeholder="value"
        className="w-16 bg-surface border border-dashed border-white/15 rounded px-1.5 py-1 text-[11px]"
      />
      <button
        onClick={() => {
          if (!newStat) return;
          onChange([...parsed, { stat: newStat, value: newValue }]);
          setNewStat("");
          setNewValue("");
        }}
        className="text-amber font-mono text-[11px] px-1.5"
      >
        + add
      </button>
    </div>
  );
}
