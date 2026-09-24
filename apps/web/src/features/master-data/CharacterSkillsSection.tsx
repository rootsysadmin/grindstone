import { useState } from "react";
import { entityConfigs } from "@grindstone/shared";
import type { MasterDataRow } from "@grindstone/shared";
import { useCreateRow, useDeleteRow, useDuplicateRow, useEntityList, useUpdateRow } from "./api.ts";
import { DuplicateRowDialog } from "./DuplicateRowDialog.tsx";

const skillsConfig = entityConfigs.skills;

// Compact inline view — just enough to see/rename a character's skills and
// jump into one for the fuller editor (the level-cost schedule lives there,
// opened via the Skills tab, not duplicated in this inline list).
export function CharacterSkillsSection({ parentId: characterId }: { parentId: number }) {
  const { data: skillRows = [] } = useEntityList(skillsConfig, { characterId: String(characterId) });
  const updateRow = useUpdateRow(skillsConfig);
  const deleteRow = useDeleteRow(skillsConfig);
  const createRow = useCreateRow(skillsConfig);
  const duplicateRow = useDuplicateRow(skillsConfig);
  const [duplicatingSkill, setDuplicatingSkill] = useState<MasterDataRow | null>(null);

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">Skills · child rows</span>
        <button
          onClick={() => createRow.mutate({ characterId, name: "New skill", slot: "Basic" })}
          className="text-amber font-mono text-[10px]"
        >
          + ADD SKILL
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {skillRows.length === 0 && <div className="p-3 text-xs text-text-faint">No skills yet.</div>}
        {skillRows.map((skill) => (
          <div key={skill.id} className="grid grid-cols-[90px_1fr_24px_24px] gap-2 items-center p-2 text-xs">
            <input
              defaultValue={(skill.slot as string) ?? ""}
              placeholder="Slot"
              className="bg-surface border border-white/10 rounded px-1.5 py-1 text-[11px] font-mono"
              onBlur={(e) => updateRow.mutate({ id: skill.id, body: { slot: e.target.value } })}
            />
            <input
              defaultValue={skill.name}
              placeholder="Name"
              className="bg-surface border border-white/10 rounded px-1.5 py-1"
              onBlur={(e) => updateRow.mutate({ id: skill.id, body: { name: e.target.value } })}
            />
            <button
              onClick={() => setDuplicatingSkill(skill)}
              title="Duplicate (copies its level-cost schedule too)"
              className="text-text-faint hover:text-text text-[11px] font-mono"
            >
              ⧉
            </button>
            <button
              onClick={() => deleteRow.mutate(skill.id)}
              className="text-pink/70 hover:text-pink text-[11px] font-mono"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-border2 font-mono text-[10px] text-text-faint">
        Upgrade costs are edited from the Skills tab — open the skill there to set its level-cost schedule.
      </div>

      {duplicatingSkill && (
        <DuplicateRowDialog
          sourceName={duplicatingSkill.name}
          busy={duplicateRow.isPending}
          onCancel={() => setDuplicatingSkill(null)}
          onConfirm={(name) => duplicateRow.mutate({ id: duplicatingSkill.id, name }, { onSuccess: () => setDuplicatingSkill(null) })}
        />
      )}
    </div>
  );
}
