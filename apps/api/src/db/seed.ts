import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { EntityKey } from "@grindstone/shared";
import { entityConfigs } from "@grindstone/shared";
import { config } from "../config.js";
import { importGameBundle, type GameBundle } from "../core/gameBundle.js";
import { db } from "./client.js";
import { gameSettings } from "./schema.js";

// seed.ts lives at apps/api/src/db/seed.ts — four levels below repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const seedDir = path.join(repoRoot, "games", config.game, "seed");

// entity key -> seed filename (kebab-case, matches its apiPath).
const seedFileFor = (key: EntityKey) => `${entityConfigs[key].apiPath}.json`;

function readSeedFile(filename: string): Record<string, unknown>[] {
  const full = path.join(seedDir, filename);
  if (!fs.existsSync(full)) return [];
  return JSON.parse(fs.readFileSync(full, "utf-8"));
}

const readSeed = (key: EntityKey) => readSeedFile(seedFileFor(key));

/**
 * game_settings is a singleton object per game, not a list of rows like
 * everything else in seed/, so it doesn't go through importGameBundle —
 * just a direct upsert by gameId.
 */
async function seedGameSettings(gameId: string) {
  const full = path.join(seedDir, "game-settings.json");
  if (!fs.existsSync(full)) return false;
  const settings = JSON.parse(fs.readFileSync(full, "utf-8"));
  const existing = await db.select({ id: gameSettings.id }).from(gameSettings).where(eq(gameSettings.gameId, gameId));
  if (existing[0]) {
    await db.update(gameSettings).set(settings).where(eq(gameSettings.id, existing[0].id));
  } else {
    await db.insert(gameSettings).values({ gameId, ...settings });
  }
  return true;
}

async function seed() {
  const gameId = config.game;
  console.log(`Seeding game "${gameId}" from ${seedDir}`);

  const bundle: GameBundle = {};
  for (const key of Object.keys(entityConfigs) as EntityKey[]) {
    bundle[key] = readSeed(key);
  }
  // child-row tables (not top-level entities, so not in entityConfigs) — see
  // apps/api/src/core/gameBundle.ts's GameBundle type for their shape.
  bundle.materialSources = readSeedFile("material-sources.json") as GameBundle["materialSources"];
  bundle.moduleTargets = readSeedFile("module-targets.json") as GameBundle["moduleTargets"];
  bundle.eventRewards = readSeedFile("event-rewards.json") as GameBundle["eventRewards"];
  bundle.characterLevelCosts = readSeedFile("character-level-costs.json") as GameBundle["characterLevelCosts"];
  bundle.equipmentLevelCosts = readSeedFile("equipment-level-costs.json") as GameBundle["equipmentLevelCosts"];
  bundle.skillLevelCosts = readSeedFile("skill-level-costs.json") as GameBundle["skillLevelCosts"];

  const summary = await importGameBundle(gameId, bundle);
  for (const [key, { created, updated }] of Object.entries(summary)) {
    console.log(`  ${key}: +${created} created, ${updated} already present`);
  }

  const wroteSettings = await seedGameSettings(gameId);
  console.log(`  gameSettings: ${wroteSettings ? "set" : "no seed/game-settings.json found"}`);

  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
