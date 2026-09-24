import type { ReactNode } from "react";

/** "#RRGGBB" -> "r,g,b", for building rgba() strings from a stored hex color. Falls back to a neutral grey for a missing/invalid value so nothing renders broken when a rank is unset. */
export function hexToRgb(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m || !m[1]) return "148,163,184";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** A tier's name + color, however the caller resolved it (a rankTiers row, or the useRankTierMap() lookup below). */
export interface RankTierLike {
  name: string;
  color: string;
}

/** Small colored pill for a rank/rarity tier — same idiom as SourceBadge/StatusBadge. */
export function RankBadge({ tier }: { tier: RankTierLike | null | undefined }) {
  if (!tier) return null;
  const rgb = hexToRgb(tier.color);
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border inline-flex items-center gap-1"
      style={{ color: tier.color, borderColor: `rgba(${rgb},.4)`, background: `rgba(${rgb},.12)` }}
    >
      {tier.name}
    </span>
  );
}

/**
 * Wraps an image (or its empty placeholder) with a rank-colored border and a
 * soft diagonal rarity gradient behind it — the same visual language
 * MaterialSwatch's diagonal-stripe swatch already established for
 * materials, generalized here for anything with a bigger image (character
 * portraits, equipment icons) rather than a small inline icon. A null/unset
 * tier renders the image with no rarity treatment, not an error state.
 */
export function RarityFrame({ tier, children, className = "" }: { tier: RankTierLike | null | undefined; children: ReactNode; className?: string }) {
  if (!tier) return <div className={className}>{children}</div>;
  const rgb = hexToRgb(tier.color);
  return (
    <div
      className={className}
      style={{
        border: `1px solid rgba(${rgb},.45)`,
        background: `linear-gradient(135deg, rgba(${rgb},.28), rgba(${rgb},.05) 60%)`,
        boxShadow: `0 0 10px rgba(${rgb},.18)`,
      }}
    >
      {children}
    </div>
  );
}
