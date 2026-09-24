import type { LevelCostBandDraft, MasterDataRow, NewMaterialDraft } from "@grindstone/shared";
import { slugify } from "./slugify.ts";

/** Draft shape used only while editing — numeric fields stay strings until submit, same convention as RewardEditDraft. */
export interface LevelCostBandEditDraft {
  fromLevel: string;
  toLevel: string;
  materialMode: "existing" | "new";
  materialSlug: string | null; // existing mode only
  newMaterialName: string;
  newMaterialCategory: string;
  quantity: string;
}

export function emptyLevelCostBand(): LevelCostBandEditDraft {
  return { fromLevel: "", toLevel: "", materialMode: "existing", materialSlug: null, newMaterialName: "", newMaterialCategory: "", quantity: "" };
}

/**
 * Bands referencing a brand-new material are correlated to that material by
 * slug (slugify(name)), not by a client-side id — the backend upserts
 * newMaterials first, then resolves each band's materialSlug against
 * whatever now exists, same as any other slug-based sync reference. A name
 * reused across multiple rows collapses to one NewMaterialDraft.
 */
export function levelCostsToPayload(bands: LevelCostBandEditDraft[]): { bands: LevelCostBandDraft[]; newMaterials: NewMaterialDraft[] } {
  const newMaterialsBySlug = new Map<string, NewMaterialDraft>();
  const outBands: LevelCostBandDraft[] = [];
  for (const b of bands) {
    const fromLevel = Number(b.fromLevel) || 0;
    const toLevel = Number(b.toLevel) || 0;
    const quantity = Math.max(0, Number(b.quantity) || 0);
    if (quantity <= 0 || fromLevel <= 0 || toLevel <= 0) continue;

    let materialSlug: string | null = null;
    if (b.materialMode === "existing") {
      materialSlug = b.materialSlug;
    } else if (b.newMaterialName.trim()) {
      materialSlug = slugify(b.newMaterialName);
      newMaterialsBySlug.set(materialSlug, {
        name: b.newMaterialName.trim(),
        category: b.newMaterialCategory.trim() || null,
      });
    }
    if (!materialSlug) continue;

    outBands.push({ fromLevel, toLevel, materialSlug, quantity });
  }
  return { bands: outBands, newMaterials: [...newMaterialsBySlug.values()] };
}

/**
 * Level-up cost bands for a level-costs update — same add/remove-row idiom
 * as RewardsEditor/GrantsEditor, but each row also carries its own
 * EXISTING/NEW material toggle (the same pattern the banner form uses for
 * its featured entity), since one update can introduce a mix of materials
 * that already exist here and ones that don't yet.
 */
export function LevelCostsEditor({
  bands,
  onChange,
  materials,
}: {
  bands: LevelCostBandEditDraft[];
  onChange: (next: LevelCostBandEditDraft[]) => void;
  materials: MasterDataRow[];
}) {
  function update(i: number, patch: Partial<LevelCostBandEditDraft>) {
    onChange(bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function remove(i: number) {
    onChange(bands.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2">
      {bands.map((b, i) => (
        <div key={i} className="flex flex-col gap-1.5 border border-white/10 rounded-md p-2">
          <div className="flex gap-1.5 items-center">
            <input
              type="number"
              min={1}
              value={b.fromLevel}
              onChange={(e) => update(i, { fromLevel: e.target.value })}
              placeholder="from"
              className="w-[64px] flex-none bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
            />
            <span className="text-text-faint text-xs flex-none">→</span>
            <input
              type="number"
              min={1}
              value={b.toLevel}
              onChange={(e) => update(i, { toLevel: e.target.value })}
              placeholder="to"
              className="w-[64px] flex-none bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
            />
            <input
              type="number"
              min={0}
              value={b.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
              placeholder="qty"
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-right"
            />
            <button onClick={() => remove(i)} className="flex-none text-pink/60 hover:text-pink font-mono text-xs px-1">
              ✕
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => update(i, { materialMode: "existing" })}
              className={`flex-1 text-center text-[10px] font-mono py-1 rounded border ${b.materialMode === "existing" ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
            >
              EXISTING MATERIAL
            </button>
            <button
              onClick={() => update(i, { materialMode: "new" })}
              className={`flex-1 text-center text-[10px] font-mono py-1 rounded border ${b.materialMode === "new" ? "bg-amber/15 border-amber/40 text-amber" : "bg-white/5 border-white/10 text-text-dim"}`}
            >
              NEW MATERIAL
            </button>
          </div>
          {b.materialMode === "existing" ? (
            <select value={b.materialSlug ?? ""} onChange={(e) => update(i, { materialSlug: e.target.value })} className="w-full bg-surface border border-white/10 rounded px-2 py-1.5 text-sm">
              <option value="" disabled>
                Select material…
              </option>
              {materials.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={b.newMaterialName}
                onChange={(e) => update(i, { newMaterialName: e.target.value })}
                placeholder="name"
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
              />
              <input
                value={b.newMaterialCategory}
                onChange={(e) => update(i, { newMaterialCategory: e.target.value })}
                placeholder="category (optional)"
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      ))}
      <button onClick={() => onChange([...bands, emptyLevelCostBand()])} className="text-left text-[11px] font-mono text-text-faint border border-dashed border-white/10 rounded px-2 py-1.5">
        + add band
      </button>
    </div>
  );
}
