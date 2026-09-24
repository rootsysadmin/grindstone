/** Mirrors apps/api/src/core/slugify.ts exactly — a level-costs band referencing a brand-new material must compute the same slug the backend will assign it, since the two are correlated by slug, not by client-side id. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
