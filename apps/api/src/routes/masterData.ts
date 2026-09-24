import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, like } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import type { EntityConfig, FieldConfig } from "@grindstone/shared";
import { db } from "../db/client.js";
import { apiPathToEntity } from "../core/masterDataTables.js";
import { slugify, withUniqueSlug } from "../core/slugify.js";
import { deleteImage, findImageUrl, renameImage, saveImage } from "../core/images.js";
import { duplicateMasterDataRow } from "../core/duplicateRow.js";
import { exportGameBundle, importGameBundle, type GameBundle } from "../core/gameBundle.js";

const metaKeys = ["id", "gameId", "slug", "name", "source", "status", "createdAt", "updatedAt", "updatedBy"];

function coerceValue(field: FieldConfig, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (field.type) {
    case "number":
      return typeof raw === "number" ? raw : Number(raw);
    case "boolean":
      return typeof raw === "boolean" ? raw : raw === "true" || raw === "1" || raw === 1;
    case "relation":
      return typeof raw === "number" ? raw : Number(raw);
    default:
      return String(raw);
  }
}

function validateRequired(config: EntityConfig, body: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of config.fields) {
    if (field.required && (body[field.key] === undefined || body[field.key] === null || body[field.key] === "")) {
      missing.push(field.key);
    }
  }
  return missing;
}

function buildRowPayload(config: EntityConfig, body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const field of config.fields) {
    if (field.key in body) payload[field.key] = coerceValue(field, body[field.key]);
  }
  return payload;
}

export async function masterDataRoutes(app: FastifyInstance) {
  for (const { key, config, table } of apiPathToEntity.values()) {
    const base = `/api/games/:game/${config.apiPath}`;
    const t = table as any;

    app.get(base, async (req: FastifyRequest<{ Params: { game: string }; Querystring: Record<string, string> }>) => {
      const { game } = req.params;
      const q = req.query;
      const conditions = [eq(t.gameId, game)];
      if (q.status) conditions.push(eq(t.status, q.status));
      if (q.source) conditions.push(eq(t.source, q.source));
      if (q.search) conditions.push(like(t.name, `%${q.search}%`));
      for (const field of config.fields) {
        if (field.type === "relation" && q[field.key] !== undefined) {
          conditions.push(eq(t[field.key] as AnySQLiteColumn, Number(q[field.key])));
        }
      }
      const rows = await db
        .select()
        .from(t)
        .where(and(...conditions));
      const withImages = config.hasImage
        ? rows.map((r: any) => ({ ...r, imageUrl: findImageUrl(game, config.apiPath, r.slug) }))
        : rows;
      return withImages;
    });

    app.get(
      `${base}/export.csv`,
      async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
        const rows = await db
          .select()
          .from(t)
          .where(eq(t.gameId, req.params.game));
        const csv = stringifyCsv(rows, { header: true });
        reply.header("Content-Type", "text/csv").header(
          "Content-Disposition",
          `attachment; filename="${config.apiPath}.csv"`,
        );
        return csv;
      },
    );

    app.post(`${base}/import.csv`, async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
      const file = await (req as any).file();
      if (!file) return reply.code(400).send({ error: "No file uploaded" });
      const buf = await file.toBuffer();
      const records: Record<string, string>[] = parseCsv(buf, { columns: true, skip_empty_lines: true });
      let created = 0;
      let updated = 0;
      for (const record of records) {
        const gameId = req.params.game;
        const name = record.name;
        if (!name) continue;
        const baseSlug = record.slug ? slugify(record.slug) : slugify(name);
        const payload = buildRowPayload(config, record);
        payload.name = name;
        const existing = await db
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.gameId, gameId), eq(t.slug, baseSlug)));
        if (existing[0]) {
          await db
            .update(t)
            .set({ ...payload, updatedAt: Math.floor(Date.now() / 1000) })
            .where(eq(t.id, existing[0].id));
          updated++;
        } else {
          await db.insert(t).values({
            ...payload,
            gameId,
            slug: baseSlug,
            source: "manual",
          });
          created++;
        }
      }
      return { created, updated };
    });

    // Full-fidelity per-table export/import: unlike export.csv/import.csv
    // above (a flat SELECT * of this table's own columns only, numeric FK
    // ids as-is), this includes the entity's sub-item child rows (ascension/
    // upgrade level-cost bands, module target pieces, event rewards,
    // material sources — whichever apply, see childBundleKeysForEntity) and
    // expresses every relation as a portable *Slug reference, not a raw id
    // — the same shape as a full-game bundle export (gameBundle.ts) and
    // games/<slug>/seed/*.json, just scoped to this one entity. That shared
    // shape is the point: this is what makes hand-authoring/editing seed
    // data from a real export practical, and what a full-game bundle export
    // already gave you for free at the whole-game level but this table's
    // own CSV export never did.
    app.get(`${base}/export.json`, async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
      const bundle = await exportGameBundle(req.params.game, [key]);
      reply
        .header("Content-Type", "application/json")
        .header("Content-Disposition", `attachment; filename="${config.apiPath}.json"`);
      return bundle;
    });

    app.post(`${base}/import.json`, async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
      let bundle: GameBundle;
      if (req.isMultipart()) {
        const file = await (req as any).file();
        if (!file) return reply.code(400).send({ error: "No file uploaded" });
        const buf = await file.toBuffer();
        bundle = JSON.parse(buf.toString("utf-8"));
      } else {
        bundle = req.body as GameBundle;
      }
      const summary = await importGameBundle(req.params.game, bundle);
      return summary;
    });

    app.get(
      `${base}/:id`,
      async (req: FastifyRequest<{ Params: { game: string; id: string } }>, reply) => {
        const rows = await db
          .select()
          .from(t)
          .where(and(eq(t.gameId, req.params.game), eq(t.id, Number(req.params.id))));
        const row = rows[0];
        if (!row) return reply.code(404).send({ error: "Not found" });
        return config.hasImage
          ? { ...row, imageUrl: findImageUrl(req.params.game, config.apiPath, row.slug) }
          : row;
      },
    );

    app.post(`${base}`, async (req: FastifyRequest<{ Params: { game: string }; Body: Record<string, unknown> }>, reply) => {
      const body = req.body ?? {};
      const missing = validateRequired(config, body);
      if (missing.length) return reply.code(400).send({ error: "Missing required fields", fields: missing });
      const name = String(body.name);
      const baseSlug = body.slug ? slugify(String(body.slug)) : slugify(name);
      const slug = await withUniqueSlug(t, req.params.game, baseSlug);
      const payload = buildRowPayload(config, body);
      const rows = (await db
        .insert(t)
        .values({
          ...payload,
          gameId: req.params.game,
          name,
          slug,
          source: body.source ?? "manual",
          status: body.status ?? "published",
          updatedBy: body.updatedBy ?? null,
        })
        .returning()) as any[];
      return rows[0];
    });

    app.patch(
      `${base}/:id`,
      async (req: FastifyRequest<{ Params: { game: string; id: string }; Body: Record<string, unknown> }>, reply) => {
        const id = Number(req.params.id);
        const body = req.body ?? {};
        const [existing] = await db.select().from(t).where(and(eq(t.gameId, req.params.game), eq(t.id, id)));
        if (!existing) return reply.code(404).send({ error: "Not found" });
        const payload = buildRowPayload(config, body);
        if (body.name) payload.name = String(body.name);
        if (body.status) payload.status = body.status;
        if (body.source) payload.source = body.source;
        // No entity exposes a slug input, so the record editor's form always
        // round-trips the row's existing slug unchanged in `body.slug` — that
        // is NOT a deliberate "set this slug" request, so it must not block
        // slug from following a plain name edit. Only a body.slug that
        // actually differs from the stored one counts as an explicit
        // override (e.g. a direct API call); otherwise, a changed name is
        // what should drive the new slug, since nothing else keeps slug in
        // sync with name after creation and image lookup is keyed on slug
        // (see the renameImage call below, which follows the file on disk).
        let slugSource: string | undefined;
        if (body.slug !== undefined && String(body.slug) !== existing.slug) {
          slugSource = String(body.slug);
        } else if (body.name && String(body.name) !== existing.name) {
          slugSource = String(body.name);
        }
        if (slugSource !== undefined) {
          payload.slug = await withUniqueSlug(t, req.params.game, slugify(slugSource), id);
        }
        payload.updatedAt = Math.floor(Date.now() / 1000);
        if (body.updatedBy !== undefined) payload.updatedBy = body.updatedBy;
        const rows = (await db
          .update(t)
          .set(payload)
          .where(and(eq(t.gameId, req.params.game), eq(t.id, id)))
          .returning()) as any[];
        const row = rows[0];
        if (!row) return reply.code(404).send({ error: "Not found" });
        if (config.hasImage && payload.slug && payload.slug !== existing.slug) {
          renameImage(req.params.game, config.apiPath, existing.slug, payload.slug as string);
        }
        return row;
      },
    );

    app.post(
      `${base}/:id/duplicate`,
      async (req: FastifyRequest<{ Params: { game: string; id: string }; Body: { name?: string } }>, reply) => {
        const name = req.body?.name ? String(req.body.name) : undefined;
        const row = await duplicateMasterDataRow(req.params.game, key, Number(req.params.id), name);
        if (!row) return reply.code(404).send({ error: "Not found" });
        return row;
      },
    );

    app.delete(
      `${base}/:id`,
      async (req: FastifyRequest<{ Params: { game: string; id: string } }>, reply) => {
        const id = Number(req.params.id);
        const rows = await db
          .select()
          .from(t)
          .where(and(eq(t.gameId, req.params.game), eq(t.id, id)));
        const row = rows[0];
        if (!row) return reply.code(404).send({ error: "Not found" });

        // Deleting a character cascades to its skills (child rows) — see
        // entityConfigs' childOf relationship in @grindstone/shared.
        if (key === "characters") {
          const skillsTable = apiPathToEntity.get("skills")!.table as any;
          await db
            .delete(skillsTable)
            .where(and(eq(skillsTable.gameId, req.params.game), eq(skillsTable.characterId, id)));
        }

        await db.delete(t).where(and(eq(t.gameId, req.params.game), eq(t.id, id)));
        if (config.hasImage) deleteImage(req.params.game, config.apiPath, row.slug);
        return { ok: true };
      },
    );

    if (config.hasImage) {
      app.post(
        `${base}/:id/image`,
        async (req: FastifyRequest<{ Params: { game: string; id: string } }>, reply) => {
          const id = Number(req.params.id);
          const rows = await db
            .select()
            .from(t)
            .where(and(eq(t.gameId, req.params.game), eq(t.id, id)));
          const row = rows[0];
          if (!row) return reply.code(404).send({ error: "Not found" });
          const file = await (req as any).file();
          if (!file) return reply.code(400).send({ error: "No file uploaded" });
          const ext = file.filename.split(".").pop() ?? "png";
          const buf = await file.toBuffer();
          const imageUrl = saveImage(req.params.game, config.apiPath, row.slug, ext, buf);
          return { imageUrl };
        },
      );

      app.delete(
        `${base}/:id/image`,
        async (req: FastifyRequest<{ Params: { game: string; id: string } }>, reply) => {
          const id = Number(req.params.id);
          const rows = await db
            .select({ slug: t.slug })
            .from(t)
            .where(and(eq(t.gameId, req.params.game), eq(t.id, id)));
          const row = rows[0];
          if (!row) return reply.code(404).send({ error: "Not found" });
          deleteImage(req.params.game, config.apiPath, row.slug);
          return { ok: true };
        },
      );
    }
  }
}
