import path from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's own loader can't resolve our ESM ".js"-suffixed relative
// imports (see apps/api/src/config.ts), so the db path is inlined here
// rather than imported — this file only needs it for `db:generate`/studio,
// not for runtime, where src/config.ts remains the single source of truth.
const dataDir = process.env.DATA_DIR ?? path.resolve(__dirname, "..", "..", "data");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(dataDir, "grindstone.db"),
  },
});
