import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(apiRoot, "..", "..");

export const config = {
  port: Number(process.env.PORT ?? 3001),
  game: process.env.GAME ?? "neverness-to-everness",
  dataDir: process.env.DATA_DIR ?? path.join(repoRoot, "data"),
  get dbPath() {
    return path.join(this.dataDir, "grindstone.db");
  },
  get imagesDir() {
    return path.join(this.dataDir, "images");
  },
  webDistDir: path.join(repoRoot, "apps", "web", "dist"),
};
