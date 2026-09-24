import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const ALLOWED_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "avif"];

function entityImagesDir(gameId: string, entityApiPath: string): string {
  return path.join(config.imagesDir, gameId, entityApiPath);
}

/** Case-insensitive, extension-flexible lookup — returns the relative /images/ URL, or null if no picture is set. */
export function findImageUrl(gameId: string, entityApiPath: string, slug: string): string | null {
  const dir = entityImagesDir(gameId, entityApiPath);
  if (!fs.existsSync(dir)) return null;
  const wanted = slug.toLowerCase();
  for (const entry of fs.readdirSync(dir)) {
    const ext = path.extname(entry).slice(1).toLowerCase();
    const base = path.basename(entry, path.extname(entry)).toLowerCase();
    if (base === wanted && ALLOWED_EXTENSIONS.includes(ext)) {
      return `/images/${gameId}/${entityApiPath}/${entry}`;
    }
  }
  return null;
}

/** Writes the upload to <slug>.<ext>, removing any other extension variants for the same slug first (override, not accumulate). */
export function saveImage(
  gameId: string,
  entityApiPath: string,
  slug: string,
  ext: string,
  data: Buffer,
): string {
  const normalizedExt = ext.toLowerCase().replace(/^\./, "");
  if (!ALLOWED_EXTENSIONS.includes(normalizedExt)) {
    throw new Error(`Unsupported image extension: ${ext}`);
  }
  const dir = entityImagesDir(gameId, entityApiPath);
  fs.mkdirSync(dir, { recursive: true });
  const wanted = slug.toLowerCase();
  for (const entry of fs.readdirSync(dir)) {
    const base = path.basename(entry, path.extname(entry)).toLowerCase();
    if (base === wanted) fs.rmSync(path.join(dir, entry));
  }
  const filename = `${slug}.${normalizedExt}`;
  fs.writeFileSync(path.join(dir, filename), data);
  return `/images/${gameId}/${entityApiPath}/${filename}`;
}

/** Renames the on-disk image file (if any) from oldSlug to newSlug, keeping its extension — used when a row's slug changes (e.g. following a name edit) so findImageUrl keeps resolving it under the new slug instead of orphaning the file under the old one. No-op if no image is currently set. */
export function renameImage(gameId: string, entityApiPath: string, oldSlug: string, newSlug: string): void {
  if (oldSlug.toLowerCase() === newSlug.toLowerCase()) return;
  const dir = entityImagesDir(gameId, entityApiPath);
  if (!fs.existsSync(dir)) return;
  const wanted = oldSlug.toLowerCase();
  const match = fs.readdirSync(dir).find((entry) => path.basename(entry, path.extname(entry)).toLowerCase() === wanted);
  if (!match) return;
  const ext = path.extname(match);
  // Clear any file already sitting on the new slug first, same "override, not accumulate" rule saveImage uses.
  for (const entry of fs.readdirSync(dir)) {
    const base = path.basename(entry, path.extname(entry)).toLowerCase();
    if (base === newSlug.toLowerCase()) fs.rmSync(path.join(dir, entry));
  }
  fs.renameSync(path.join(dir, match), path.join(dir, `${newSlug}${ext}`));
}

export function deleteImage(gameId: string, entityApiPath: string, slug: string): void {
  const dir = entityImagesDir(gameId, entityApiPath);
  if (!fs.existsSync(dir)) return;
  const wanted = slug.toLowerCase();
  for (const entry of fs.readdirSync(dir)) {
    const base = path.basename(entry, path.extname(entry)).toLowerCase();
    if (base === wanted) fs.rmSync(path.join(dir, entry));
  }
}
