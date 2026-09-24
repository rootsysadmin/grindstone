import { entityConfigs } from "@grindstone/shared";
import { useEntityList } from "./api.ts";
import {
  characterLevelCostsApi,
  equipmentLevelCostsApi,
  skillLevelCostsApi,
  type CharacterLevelCostRow,
  type EquipmentLevelCostRow,
  type SkillLevelCostRow,
} from "./api.ts";

type LevelCostRow = CharacterLevelCostRow | EquipmentLevelCostRow | SkillLevelCostRow;

interface ChildRowApi<Row extends { id: number }> {
  useList: (parentId: number | null) => { data: Row[] | undefined };
  useCreate: (parentId: number) => { mutate: (body: Record<string, unknown>) => void };
  useUpdate: (parentId: number) => { mutate: (args: { id: number; body: Record<string, unknown> }) => void };
  useDelete: (parentId: number) => { mutate: (id: number) => void };
}

interface Band {
  fromLevel: number;
  toLevel: number;
  rows: LevelCostRow[];
}

/**
 * Groups the flat row list into level bands for display — a *stable,
 * first-seen* bucketing by (fromLevel, toLevel), not a sort. A band's
 * position is wherever its first row first appeared in the list the API
 * returned (insertion order), so a newly added band always lands at the
 * bottom and never gets reshuffled by level number. This is presentation
 * only: the underlying rows are still the same flat
 * {fromLevel, toLevel, materialId, quantity} shape, one row per material —
 * a real level typically needs several materials at once (see the N2E
 * skill-tree screenshot that prompted this), which the flat shape already
 * supported by just having several rows share one band.
 */
function groupIntoBands(rows: LevelCostRow[]): Band[] {
  const order: string[] = [];
  const byKey = new Map<string, Band>();
  for (const row of rows) {
    const key = `${row.fromLevel}:${row.toLevel}`;
    let band = byKey.get(key);
    if (!band) {
      band = { fromLevel: row.fromLevel, toLevel: row.toLevel, rows: [] };
      byKey.set(key, band);
      order.push(key);
    }
    band.rows.push(row);
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * Shared editor for the three level-band cost schedules (character/
 * equipment/skill) — same row shape (fromLevel -> toLevel costs either
 * `quantity` of `materialId`, or a flat `expAmount`), same UI, so it's
 * written once and instantiated per entity below rather than duplicated
 * three times. For character/weapon these bands are typically wide (e.g.
 * 1 -> 20); for skills every row is naturally a single-level band (e.g.
 * 6 -> 7) — the user sources whichever granularity actually matches the
 * game. `supportsExp` gates the "+ add EXP" affordance — only
 * character/equipment schedules can carry an exp-kind row; skills stay
 * material-only (skillLevelCosts has no kind/expAmount columns at all).
 */
function LevelCostsSection({ parentId, api, title, supportsExp = false }: { parentId: number; api: ChildRowApi<LevelCostRow>; title: string; supportsExp?: boolean }) {
  const { data: rows = [] } = api.useList(parentId);
  const createRow = api.useCreate(parentId);
  const updateRow = api.useUpdate(parentId);
  const deleteRow = api.useDelete(parentId);
  const { data: materials = [] } = useEntityList(entityConfigs.materials);

  const bands = groupIntoBands(rows);

  function setBandLevel(band: Band, patch: { fromLevel?: number; toLevel?: number }) {
    for (const row of band.rows) updateRow.mutate({ id: row.id, body: patch });
  }

  function addMaterialToBand(band: Band) {
    createRow.mutate({ fromLevel: band.fromLevel, toLevel: band.toLevel, kind: "material", materialId: materials[0]?.id ?? null, quantity: 1 });
  }

  function addExpToBand(band: Band) {
    createRow.mutate({ fromLevel: band.fromLevel, toLevel: band.toLevel, kind: "exp", expAmount: 0 });
  }

  function addLevel() {
    const last = bands[bands.length - 1];
    const fromLevel = last ? last.toLevel : 1;
    const toLevel = last ? last.toLevel + 1 : 2;
    createRow.mutate({ fromLevel, toLevel, kind: "material", materialId: materials[0]?.id ?? null, quantity: 1 });
  }

  return (
    <div className="bg-surface border border-border2 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-dim">{title} · material cost schedule</span>
        <button onClick={addLevel} className="text-amber font-mono text-[10px]">
          + ADD LEVEL
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border2">
        {bands.length === 0 && <div className="p-3 text-xs text-text-faint">No cost data sourced yet.</div>}
        {bands.map((band, bi) => (
          <div key={bi} className="p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wide text-text-faint">From</span>
              <input
                type="number"
                min={0}
                defaultValue={band.fromLevel}
                key={`from-${band.rows[0]?.id}-${band.fromLevel}`}
                className="w-16 bg-surface2 border border-white/10 rounded px-1.5 py-1 font-mono text-xs"
                onBlur={(e) => setBandLevel(band, { fromLevel: Math.max(0, Number(e.target.value)) })}
              />
              <span className="font-mono text-[9px] uppercase tracking-wide text-text-faint">To</span>
              <input
                type="number"
                min={0}
                defaultValue={band.toLevel}
                key={`to-${band.rows[0]?.id}-${band.toLevel}`}
                className="w-16 bg-surface2 border border-white/10 rounded px-1.5 py-1 font-mono text-xs"
                onBlur={(e) => setBandLevel(band, { toLevel: Math.max(0, Number(e.target.value)) })}
              />
              <div className="flex-1" />
              <button onClick={() => addMaterialToBand(band)} className="text-amber font-mono text-[10px]">
                + add material
              </button>
              {supportsExp && (
                <button onClick={() => addExpToBand(band)} className="text-blue font-mono text-[10px]">
                  + add EXP
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {band.rows.map((row) => {
                const isExp = "kind" in row && row.kind === "exp";
                if (isExp) {
                  return (
                    <div key={row.id} className="grid grid-cols-[1fr_88px_28px] gap-2 items-center pl-3">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-blue">EXP</span>
                      <input
                        type="number"
                        min={0}
                        defaultValue={(row as { expAmount: number | null }).expAmount ?? 0}
                        className="bg-white/5 border border-white/10 rounded px-1.5 py-1 text-right font-mono text-xs"
                        onBlur={(e) => updateRow.mutate({ id: row.id, body: { expAmount: Math.max(0, Number(e.target.value)) } })}
                      />
                      <button onClick={() => deleteRow.mutate(row.id)} className="text-pink/70 hover:text-pink font-mono text-xs">
                        ✕
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={row.id} className="grid grid-cols-[1fr_88px_28px] gap-2 items-center pl-3">
                    <select
                      defaultValue={(row as { materialId: number | null }).materialId ?? undefined}
                      className="bg-surface border border-white/10 rounded px-1.5 py-1 text-xs"
                      onChange={(e) => updateRow.mutate({ id: row.id, body: { materialId: Number(e.target.value) } })}
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      defaultValue={(row as { quantity: number | null }).quantity ?? 0}
                      className="bg-white/5 border border-white/10 rounded px-1.5 py-1 text-right font-mono text-xs"
                      onBlur={(e) => updateRow.mutate({ id: row.id, body: { quantity: Math.max(0, Number(e.target.value)) } })}
                    />
                    <button onClick={() => deleteRow.mutate(row.id)} className="text-pink/70 hover:text-pink font-mono text-xs">
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CharacterLevelCostsSection({ parentId }: { parentId: number }) {
  return <LevelCostsSection parentId={parentId} api={characterLevelCostsApi} title="Character level" supportsExp />;
}

export function EquipmentLevelCostsSection({ parentId }: { parentId: number }) {
  return <LevelCostsSection parentId={parentId} api={equipmentLevelCostsApi} title="Weapon level" supportsExp />;
}

export function SkillLevelCostsSection({ parentId }: { parentId: number }) {
  return <LevelCostsSection parentId={parentId} api={skillLevelCostsApi} title="Skill level" />;
}
