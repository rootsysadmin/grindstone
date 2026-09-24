import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { teamMembers, teams } from "../db/schema.js";

type GameParams = { game: string };
type GameIdParams = { game: string; id: string };

/** CRUD for teams. team_members are child rows, registered through the generic childRows.ts factory (for add/remove/edit) — but the list here embeds them directly, so a page doesn't need N+1 requests to know who's on each team. */
export async function teamRoutes(app: FastifyInstance) {
  app.get(
    "/api/games/:game/teams",
    async (req: FastifyRequest<{ Params: GameParams; Querystring: { characterId?: string } }>) => {
      const { game } = req.params;
      const allTeams = await db.select().from(teams).where(eq(teams.gameId, game));
      const allMembers = await db.select().from(teamMembers).where(eq(teamMembers.gameId, game));
      const membersByTeam = new Map<number, typeof allMembers>();
      for (const m of allMembers) membersByTeam.set(m.teamId, [...(membersByTeam.get(m.teamId) ?? []), m]);

      let result = allTeams.map((t) => ({ ...t, members: membersByTeam.get(t.id) ?? [] }));
      if (req.query.characterId) {
        const characterId = Number(req.query.characterId);
        result = result.filter((t) => t.members.some((m) => m.characterId === characterId));
      }
      return result;
    },
  );

  app.post(
    "/api/games/:game/teams",
    async (req: FastifyRequest<{ Params: GameParams; Body: { name: string; notes?: string | null } }>) => {
      const [row] = (await db
        .insert(teams)
        .values({ gameId: req.params.game, ...req.body })
        .returning()) as any[];
      return row;
    },
  );

  app.patch(
    "/api/games/:game/teams/:id",
    async (req: FastifyRequest<{ Params: GameIdParams; Body: { name?: string; notes?: string | null } }>, reply) => {
      const [row] = (await db
        .update(teams)
        .set({ ...req.body, updatedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(teams.gameId, req.params.game), eq(teams.id, Number(req.params.id))))
        .returning()) as any[];
      if (!row) return reply.code(404).send({ error: "Not found" });
      return row;
    },
  );

  app.delete("/api/games/:game/teams/:id", async (req: FastifyRequest<{ Params: GameIdParams }>) => {
    const teamId = Number(req.params.id);
    await db.delete(teamMembers).where(and(eq(teamMembers.gameId, req.params.game), eq(teamMembers.teamId, teamId)));
    await db.delete(teams).where(and(eq(teams.gameId, req.params.game), eq(teams.id, teamId)));
    return { ok: true };
  });
}
