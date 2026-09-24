import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { EntityConfig, EntityKey, GameConfig } from "@grindstone/shared";
import { interpolateLabel } from "@grindstone/shared";
import {
  useCreateRow,
  useDeleteRow,
  useEntityRow,
  useRelationOptions,
  useUpdateRow,
  useUploadImage,
} from "./api.ts";
import { useActiveGame } from "../../state/gameContext.tsx";
import { CharacterSkillsSection } from "./CharacterSkillsSection.tsx";
import { MaterialSourcesSection } from "./MaterialSourcesSection.tsx";
import { ModuleTargetsSection } from "./ModuleTargetsSection.tsx";
import { EventRewardsSection } from "./EventRewardsSection.tsx";
import { CharacterLevelCostsSection, EquipmentLevelCostsSection, SkillLevelCostsSection } from "./LevelCostsSection.tsx";

// Per-entity extra sections rendered below the field grid, once the row
// exists (needs a real id) — one place to register these instead of a
// chain of `config.key === "..."` checks. A list, not a single component,
// since an entity can need more than one (e.g. characters get both their
// skills list and their level-cost schedule).
const childSections: Partial<Record<EntityKey, ComponentType<{ parentId: number }>[]>> = {
  characters: [CharacterSkillsSection, CharacterLevelCostsSection],
  materials: [MaterialSourcesSection],
  skills: [SkillLevelCostsSection],
  modules: [ModuleTargetsSection],
  equipmentItems: [EquipmentLevelCostsSection],
  events: [EventRewardsSection],
};

function optionsForField(gameConfig: GameConfig, fieldKey: string, optionsFrom: string | undefined): string[] {
  if (optionsFrom === "equipmentTypes") return [...gameConfig.equipmentTypes];
  if (optionsFrom === "elements") return [...gameConfig.elements];
  if (optionsFrom === "augmentPieceTypes") return [...gameConfig.augmentPieceTypes];
  if (optionsFrom === "augmentShapes") return [...gameConfig.augmentShapes];
  void fieldKey;
  return [];
}

export function RecordEditor({
  config,
  id,
  onClose,
  onCreated,
}: {
  config: EntityConfig;
  id: number | null;
  onClose: () => void;
  /** Called after a successful create, with the new row's id, so the caller can switch this same drawer into "editing that row" instead of it closing — needed so child sections (which require a real id) become available right away. */
  onCreated: (id: number) => void;
}) {
  const isNew = id === null;
  const { config: gameConfig } = useActiveGame();
  const { data: row } = useEntityRow(config, id);
  const relationOptions = useRelationOptions(config);
  const createRow = useCreateRow(config);
  const updateRow = useUpdateRow(config);
  const deleteRow = useDeleteRow(config);
  const uploadImage = useUploadImage(config);

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setForm(row ? { ...row } : {});
  }, [row, id]);

  const missing = config.fields.filter(
    (f) => f.required && (form[f.key] === null || form[f.key] === undefined || form[f.key] === ""),
  );

  function setField(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  async function handleSave() {
    setTouched(true);
    if (missing.length > 0) return;
    if (isNew) {
      const created = await createRow.mutateAsync(form);
      flashSaved();
      onCreated(created.id);
    } else {
      await updateRow.mutateAsync({ id: id!, body: form });
      flashSaved();
    }
  }

  const entityLabel = interpolateLabel(config.label, gameConfig.terms);
  const ChildSectionList = childSections[config.key] ?? [];

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-[520px] max-w-full h-full bg-panel border-l border-white/10 flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border2 bg-surface2">
          <span className="text-text-faint font-mono text-xs">{entityLabel} /</span>
          <span className="font-display font-bold text-base">{isNew ? "New" : ((form.name as string) ?? "…")}</span>
          {!isNew && Boolean(form.source) && (
            <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded border bg-white/5 border-white/15 text-text-dim">
              {String(form.source)}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-text-faint hover:text-text text-sm">
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {config.hasImage && !isNew && (
            <div className="bg-surface border border-border2 rounded-lg p-3 flex items-center gap-3">
              {form.imageUrl ? (
                <img src={String(form.imageUrl)} className="w-16 h-16 rounded object-cover" />
              ) : (
                <div className="w-16 h-16 rounded border border-dashed border-white/15 grid place-items-center text-[9px] text-text-faint font-mono">
                  no image
                </div>
              )}
              <label className="text-xs font-mono text-blue cursor-pointer border border-blue/40 bg-blue/10 rounded-md px-3 py-1.5">
                Upload image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage.mutate({ id: id!, file });
                  }}
                />
              </label>
            </div>
          )}

          {touched && missing.length > 0 && (
            <div className="bg-pink/10 border border-pink/30 rounded-md px-3 py-2 text-xs text-pink">
              Missing required: {missing.map((f) => interpolateLabel(f.label, gameConfig.terms)).join(", ")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {config.fields.map((field) => {
              const label = interpolateLabel(field.label, gameConfig.terms);
              const value = form[field.key];
              const isMissing = touched && field.required && (value === null || value === undefined || value === "");
              const wrapperCls = field.type === "textarea" ? "col-span-2" : "";
              const inputCls = `bg-white/5 border rounded-md px-2.5 py-1.5 text-sm w-full outline-none focus:border-blue/50 ${
                isMissing ? "border-pink/50" : "border-white/10"
              }`;
              // Selects need a solid (non-transparent) background: the translucent
              // bg-white/5 above composites fine against the page for text/date/number
              // inputs, but a native <select> popup renders as its own layer outside
              // the page, so that translucency ends up compositing against opaque OS
              // chrome instead — near-white, unreadable. See docs/progress.md.
              const selectCls = `bg-surface border rounded-md px-2.5 py-1.5 text-sm w-full outline-none focus:border-blue/50 ${
                isMissing ? "border-pink/50" : "border-white/10"
              }`;

              return (
                <div key={field.key} className={wrapperCls}>
                  <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">
                    {label}
                    {field.required && " *"}
                  </div>
                  {field.type === "textarea" ? (
                    <textarea
                      className={inputCls}
                      rows={2}
                      value={(value as string) ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : field.type === "boolean" ? (
                    <button
                      onClick={() => setField(field.key, !value)}
                      className={`w-11 h-[26px] rounded-full flex items-center px-0.5 ${value ? "bg-green justify-end" : "bg-white/15 justify-start"}`}
                    >
                      <span className="w-[18px] h-[18px] rounded-full bg-ink" />
                    </button>
                  ) : field.type === "select" ? (
                    <select
                      className={selectCls}
                      value={(value as string) ?? ""}
                      onChange={(e) => setField(field.key, e.target.value || null)}
                    >
                      <option value="">—</option>
                      {(field.options ?? optionsForField(gameConfig, field.key, field.optionsFrom)).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "relation" ? (
                    <select
                      className={selectCls}
                      value={value ? String(value) : ""}
                      onChange={(e) => setField(field.key, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">—</option>
                      {(relationOptions[field.key] ?? []).map((opt) => (
                        <option key={opt.id} value={opt.id} style={opt.color ? { color: String(opt.color) } : undefined}>
                          {field.relationEntity === "rankTiers" ? `● ${opt.name}` : opt.name}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "date" ? (
                    <input
                      type="date"
                      className={inputCls}
                      value={(value as string) ?? ""}
                      onChange={(e) => setField(field.key, e.target.value || null)}
                    />
                  ) : field.type === "number" ? (
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      value={value === null || value === undefined ? "" : String(value)}
                      onChange={(e) =>
                        setField(field.key, e.target.value === "" ? null : Math.max(0, Number(e.target.value)))
                      }
                    />
                  ) : field.type === "color" ? (
                    <input
                      type="color"
                      className="h-[34px] w-full bg-white/5 border border-white/10 rounded-md cursor-pointer"
                      value={(value as string) || "#888888"}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      className={inputCls}
                      value={(value as string) ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            <div>
              <div className="font-mono text-[9px] uppercase tracking-wide text-text-faint mb-1">Status</div>
              <div className="flex gap-1">
                {["draft", "published"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setField("status", s)}
                    className={`flex-1 text-center text-[11px] font-mono py-1.5 rounded-md border ${
                      (form.status ?? "published") === s
                        ? "bg-amber/15 border-amber text-amber"
                        : "bg-white/5 border-white/10 text-text-dim"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!isNew && ChildSectionList.map((ChildSection, i) => <ChildSection key={i} parentId={id!} />)}
        </div>

        <div className="mt-auto p-4 border-t border-border2 bg-surface2 flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => {
                if (confirm(`Delete "${form.name}"?`)) {
                  deleteRow.mutate(id!);
                  onClose();
                }
              }}
              className="text-xs font-mono text-pink/80 hover:text-pink"
            >
              DELETE
            </button>
          )}
          <div className="flex-1" />
          {savedFlash && <span className="text-xs font-mono text-green">Saved ✓</span>}
          <button
            onClick={onClose}
            className="text-xs font-mono px-3.5 py-2 rounded-md bg-white/5 border border-white/10 text-text-dim"
          >
            {isNew ? "CANCEL" : "CLOSE"}
          </button>
          <button
            onClick={handleSave}
            className="text-xs font-mono px-3.5 py-2 rounded-md bg-amber text-ink font-medium"
          >
            {isNew ? "CREATE" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}
