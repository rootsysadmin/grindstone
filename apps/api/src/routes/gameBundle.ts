import type { FastifyInstance, FastifyRequest } from "fastify";
import { exportGameBundle, importGameBundle, type GameBundle } from "../core/gameBundle.js";

export async function gameBundleRoutes(app: FastifyInstance) {
  app.get("/api/games/:game/export", async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
    const bundle = await exportGameBundle(req.params.game);
    reply
      .header("Content-Type", "application/json")
      .header("Content-Disposition", `attachment; filename="${req.params.game}-export.json"`);
    return bundle;
  });

  app.post("/api/games/:game/import", async (req: FastifyRequest<{ Params: { game: string } }>, reply) => {
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
}
