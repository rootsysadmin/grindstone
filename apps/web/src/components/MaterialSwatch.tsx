import { hexToRgb } from "./rankVisuals.tsx";

interface MaterialLike {
  color?: string | null; // resolved from the material's rankTierId by the caller — see useRankTierMap()
  imageUrl?: string | null;
  name?: string;
}

/**
 * A material's icon: its uploaded image if there is one, else a
 * rank-colored placeholder swatch (diagonal-stripe pattern matching the
 * mockup). Driven by a resolved hex color rather than the old hardcoded
 * per-tier palette — materials' rank now comes from the same
 * game-configurable rankTiers table every other ranked entity uses, see
 * docs/progress.md's rank-tiers entry. Use everywhere a material is
 * listed (Data page, roster/planner Materials tabs).
 */
export function MaterialSwatch({ material, size = 22 }: { material: MaterialLike; size?: number }) {
  if (material.imageUrl) {
    return (
      <img
        src={material.imageUrl}
        title={material.name}
        style={{ width: size, height: size }}
        className="rounded object-cover flex-none"
      />
    );
  }
  const rgb = hexToRgb(material.color);
  return (
    <div
      title={material.name}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        border: `1px solid rgba(${rgb},.25)`,
        background: `repeating-linear-gradient(45deg, rgba(${rgb},.18) 0 3px, rgba(${rgb},.05) 3px 6px)`,
      }}
      className="flex-none"
    />
  );
}
