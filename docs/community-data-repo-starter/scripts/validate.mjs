#!/usr/bin/env node
// Validates every changed games/<slug>/<type>/*.json file against schema.md's
// shapes. No dependencies on purpose — this repo has no build step, and a
// contributor's PR shouldn't need `npm install` to pass CI.
//
// Usage: node scripts/validate.mjs <file> [<file> ...]

import { readFileSync } from "node:fs";

const REQUIRED = {
  code: ["code"],
  banner: ["name"],
  event: ["name"],
  "level-costs": ["targetKind", "targetSlug"],
};
const KINDS = new Set(Object.keys(REQUIRED));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_KINDS = new Set(["character", "equipment", "skill"]);
const BAND_KINDS = new Set(["material", "exp"]);
const BAND_COMMON_FIELDS = ["fromLevel", "toLevel"];
const BAND_MATERIAL_FIELDS = ["materialSlug", "quantity"];
const BAND_EXP_FIELDS = ["expAmount"];

function validateOne(entry, context) {
  const errors = [];
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return [`${context}: entry must be a JSON object`];
  }
  if (!KINDS.has(entry.kind)) {
    return [`${context}: "kind" must be one of ${[...KINDS].join(", ")}`];
  }
  for (const field of REQUIRED[entry.kind]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") {
      errors.push(`${context}: "${field}" is required for kind "${entry.kind}"`);
    }
  }
  for (const field of ["startDate", "endDate"]) {
    if (entry[field] != null && !ISO_DATE.test(entry[field])) {
      errors.push(`${context}: "${field}" must be YYYY-MM-DD, got "${entry[field]}"`);
    }
  }
  if (entry.kind === "level-costs") {
    if (entry.targetKind != null && !TARGET_KINDS.has(entry.targetKind)) {
      errors.push(`${context}: "targetKind" must be one of ${[...TARGET_KINDS].join(", ")}`);
    }
    if (!Array.isArray(entry.bands) || entry.bands.length === 0) {
      errors.push(`${context}: "bands" is required and must be a non-empty array`);
    } else {
      entry.bands.forEach((band, i) => {
        if (typeof band !== "object" || band === null) {
          errors.push(`${context}.bands[${i}]: must be an object`);
          return;
        }
        const bandKind = band.kind ?? "material";
        if (!BAND_KINDS.has(bandKind)) {
          errors.push(`${context}.bands[${i}]: "kind" must be one of ${[...BAND_KINDS].join(", ")}`);
        }
        if (bandKind === "exp" && entry.targetKind === "skill") {
          errors.push(`${context}.bands[${i}]: "exp" bands aren't supported for targetKind "skill"`);
        }
        const fields = [...BAND_COMMON_FIELDS, ...(bandKind === "exp" ? BAND_EXP_FIELDS : BAND_MATERIAL_FIELDS)];
        for (const field of fields) {
          if (band[field] === undefined || band[field] === null || band[field] === "") {
            errors.push(`${context}.bands[${i}]: "${field}" is required`);
          }
        }
      });
    }
    if (entry.newMaterials != null) {
      if (!Array.isArray(entry.newMaterials)) {
        errors.push(`${context}: "newMaterials" must be an array`);
      } else {
        entry.newMaterials.forEach((m, i) => {
          if (typeof m !== "object" || m === null || typeof m.name !== "string" || m.name.trim() === "") {
            errors.push(`${context}.newMaterials[${i}]: "name" is required`);
          }
        });
      }
    }
  }
  return errors;
}

function validateFile(path) {
  // Path convention: games/<slug>/<codes|banners|events>/<file>.json
  const parts = path.split("/");
  const typeFolder = parts[2];
  const kindByFolder = { codes: "code", banners: "banner", events: "event", "level-costs": "level-costs" };
  const expectedKind = kindByFolder[typeFolder];
  if (parts[0] !== "games" || !expectedKind) {
    return [`${path}: not under games/<slug>/{codes,banners,events}/ — skipping`];
  }

  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    return [`${path}: could not read file (${err.message})`];
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return [`${path}: invalid JSON (${err.message})`];
  }

  const entries = Array.isArray(data) ? data : [data];
  if (entries.length === 0) return [`${path}: file is an empty array`];

  const errors = [];
  entries.forEach((entry, i) => {
    const context = `${path}${entries.length > 1 ? `[${i}]` : ""}`;
    const entryErrors = validateOne(entry, context);
    errors.push(...entryErrors);
    if (entryErrors.length === 0 && entry.kind !== expectedKind) {
      errors.push(`${context}: kind "${entry.kind}" doesn't match its folder (expected "${expectedKind}")`);
    }
  });
  return errors;
}

const files = process.argv.slice(2).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.log("No JSON files to validate.");
  process.exit(0);
}

let hasErrors = false;
for (const file of files) {
  const errors = validateFile(file);
  for (const e of errors) {
    console.error(`✗ ${e}`);
    hasErrors = true;
  }
  if (errors.length === 0) console.log(`✓ ${file}`);
}

process.exit(hasErrors ? 1 : 0);
