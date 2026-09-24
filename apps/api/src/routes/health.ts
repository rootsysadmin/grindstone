import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@grindstone/shared";
import { config } from "../config.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async (): Promise<HealthResponse> => {
    return { status: "ok", game: config.game };
  });
}
