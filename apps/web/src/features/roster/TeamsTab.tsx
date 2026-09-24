import { useState } from "react";
import type { RosterEntry } from "@grindstone/shared";
import type { RingResult } from "./buildProgress.ts";
import { useAddTeamMember, useCreateTeam, useDeleteTeam, useRemoveTeamMember, useTeams, useUpdateTeam } from "./api.ts";

/**
 * Screen 16, scoped to one character (not a global teams browser — that's
 * not part of this stage). Build%/weak-link are computed from the same
 * rings the roster grid uses, never stored. A team with an unowned member
 * renders as "planned" — that's just what "member has no build row" means,
 * no separate flag needed.
 */
export function TeamsTab({
  characterId,
  roster,
  ringByCharacter,
}: {
  characterId: number;
  roster: RosterEntry[];
  ringByCharacter: Map<number, RingResult>;
}) {
  const { data: teams = [] } = useTeams(characterId);
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [pickCharacterId, setPickCharacterId] = useState<number | "">("");

  const characterById = new Map(roster.map((r) => [r.character.id, r.character]));

  async function handleNewTeam() {
    const team = await createTeam.mutateAsync({ name: "New team" });
    await addMember.mutateAsync({ teamId: team.id, body: { characterId, sortOrder: 0 } });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button onClick={handleNewTeam} className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium">
          + NEW TEAM
        </button>
      </div>

      {teams.length === 0 && <div className="text-sm text-text-faint">No teams include this character yet.</div>}

      {teams.map((team) => {
        const memberRings = team.members.map((m) => ({ member: m, ring: ringByCharacter.get(m.characterId) }));
        const ownedMemberRings = memberRings.filter((m) => characterById.has(m.member.characterId) && roster.find((r) => r.character.id === m.member.characterId)?.build);
        const teamBuild =
          ownedMemberRings.length > 0
            ? Math.round(ownedMemberRings.reduce((a, m) => a + (m.ring?.overall ?? 0), 0) / ownedMemberRings.length)
            : 0;
        const weakLink = ownedMemberRings.length > 0
          ? ownedMemberRings.reduce((a, b) => ((a.ring?.overall ?? 0) <= (b.ring?.overall ?? 0) ? a : b))
          : null;
        const isPlanned = memberRings.some((m) => !roster.find((r) => r.character.id === m.member.characterId)?.build);

        return (
          <div
            key={team.id}
            className={`bg-surface rounded-lg overflow-hidden border ${isPlanned ? "border-dashed border-pink/35" : "border-border2"}`}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border2">
              <span className="font-display font-semibold text-sm">{team.name}</span>
              {isPlanned && (
                <span className="font-mono text-[9px] bg-pink/15 border border-pink/40 text-pink px-1.5 py-0.5 rounded">PLANNED</span>
              )}
              <div className="flex-1" />
              <button onClick={() => deleteTeam.mutate(team.id)} className="text-[10px] font-mono text-pink/70 hover:text-pink">
                delete
              </button>
            </div>
            <div className="overflow-x-auto">
            <div
              className="p-2.5 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(team.members.length, 1)}, minmax(90px,1fr)) 200px` }}
            >
              {team.members.map((m) => {
                const c = characterById.get(m.characterId);
                const r = roster.find((row) => row.character.id === m.characterId);
                const ring = ringByCharacter.get(m.characterId);
                return (
                  <div key={m.id} className="border border-white/10 rounded-md h-20 p-1.5 flex flex-col justify-end relative">
                    <button
                      onClick={() => removeMember.mutate({ teamId: team.id, id: m.id })}
                      className="absolute top-1 right-1 text-text-faint hover:text-pink text-[10px]"
                    >
                      ✕
                    </button>
                    <span className="font-mono text-[9px] text-amber">{c?.name ?? `#${m.characterId}`}</span>
                    <span className="font-mono text-[8px] text-text-dim">
                      {m.roleLabel ?? "—"} {r?.build ? `· ${ring?.overall ?? 0}%` : "· not owned"}
                    </span>
                  </div>
                );
              })}
              <div className="flex flex-col gap-1 text-xs justify-center">
                <div className="flex">
                  <span className="flex-1 text-text-dim">Team build</span>
                  <span className="font-mono text-amber">{teamBuild}%</span>
                </div>
                {weakLink && characterById.get(weakLink.member.characterId) && (
                  <div className="flex">
                    <span className="flex-1 text-text-dim">Weak link</span>
                    <span className="font-mono text-pink">
                      {characterById.get(weakLink.member.characterId)?.name} {weakLink.ring?.overall ?? 0}%
                    </span>
                  </div>
                )}
                {addingTo === team.id ? (
                  <div className="flex gap-1 mt-1">
                    <select
                      value={pickCharacterId}
                      onChange={(e) => setPickCharacterId(e.target.value ? Number(e.target.value) : "")}
                      className="flex-1 bg-surface border border-white/10 rounded px-1 py-1 text-[10px]"
                    >
                      <option value="">add member…</option>
                      {roster
                        .filter((r) => !team.members.some((m) => m.characterId === r.character.id))
                        .sort((a, b) => (ringByCharacter.get(b.character.id)?.overall ?? 0) - (ringByCharacter.get(a.character.id)?.overall ?? 0))
                        .map((r) => (
                          <option key={r.character.id} value={r.character.id}>
                            {r.character.name} {r.build ? `(${ringByCharacter.get(r.character.id)?.overall ?? 0}%)` : "(not owned)"}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={async () => {
                        if (!pickCharacterId) return;
                        await addMember.mutateAsync({ teamId: team.id, body: { characterId: Number(pickCharacterId), sortOrder: team.members.length } });
                        setAddingTo(null);
                        setPickCharacterId("");
                      }}
                      className="text-amber text-[10px] font-mono"
                    >
                      add
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAddingTo(team.id)} className="text-[10px] font-mono text-text-faint text-left mt-1">
                    + add member
                  </button>
                )}
              </div>
            </div>
            </div>
            <div className="px-2.5 pb-2.5">
              <textarea
                defaultValue={team.notes ?? ""}
                onBlur={(e) => updateTeam.mutate({ id: team.id, body: { notes: e.target.value } })}
                placeholder="What this team does, what it's ideal for…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-text-dim outline-none resize-none focus:border-blue/40"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
