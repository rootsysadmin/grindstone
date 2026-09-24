import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Appends -2, -3, ... until the slug is unique within this game's table — small dataset (master data, not user content), so a loop is fine. Lives in core/ (not routes/) so both the generic row routes and duplicateRow.ts can use it without an inverted routes->core dependency. */
export async function withUniqueSlug(table: any, gameId: string, baseSlug: string, excludeId?: number): Promise<string> {
  let candidate = baseSlug || "item";
  let n = 2;
  for (;;) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.gameId, gameId), eq(table.slug, candidate)));
    const clash = rows.find((r: { id: number }) => r.id !== excludeId);
    if (!clash) return candidate;
    candidate = `${baseSlug}-${n++}`;
  }
}
