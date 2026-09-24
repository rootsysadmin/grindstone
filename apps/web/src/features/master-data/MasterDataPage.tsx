import { useRef, useState } from "react";
import type { EntityKey } from "@grindstone/shared";
import { entityConfigs, interpolateLabel, topLevelEntityOrder } from "@grindstone/shared";
import { DataTable } from "./DataTable.tsx";
import { RecordEditor } from "./RecordEditor.tsx";
import { useActiveGame } from "../../state/gameContext.tsx";
import { gameExportUrl, useImportGameBundle } from "./api.ts";
import { useSyncSettings, useUpdateSyncSettings } from "../sync/api.ts";
import { LogUpdateDialog } from "../sync/LogUpdateDialog.tsx";

type EditorState = { mode: "edit"; id: number } | { mode: "create" } | null;

export function MasterDataPage() {
  const { slug, config: gameConfig, allConfigs, setSlug } = useActiveGame();
  const [activeEntity, setActiveEntity] = useState<EntityKey>("characters");
  const [editor, setEditor] = useState<EditorState>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const config = entityConfigs[activeEntity];
  const importBundle = useImportGameBundle();
  const importFileRef = useRef<HTMLInputElement>(null);
  const { data: syncSettings } = useSyncSettings();
  const updateSyncSettings = useUpdateSyncSettings();
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showLogUpdate, setShowLogUpdate] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-border2 bg-surface2 px-4 pt-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display font-bold text-lg">Master data</h1>
          <select
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setEditor(null);
            }}
            className="flex items-center gap-1.5 bg-surface border border-white/10 rounded-md px-2.5 py-1 font-mono text-xs outline-none"
          >
            {allConfigs.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.displayName}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          {importStatus && <span className="font-mono text-[11px] text-green">{importStatus}</span>}
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const summary = await importBundle.mutateAsync(file);
              const totals = Object.values(summary as Record<string, { created: number; updated: number }>).reduce(
                (acc, s) => ({ created: acc.created + s.created, updated: acc.updated + s.updated }),
                { created: 0, updated: 0 },
              );
              setImportStatus(`Imported: +${totals.created} created, ${totals.updated} updated`);
              setTimeout(() => setImportStatus(null), 6000);
            }}
          />
          <button
            onClick={() => importFileRef.current?.click()}
            className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
          >
            IMPORT GAME
          </button>
          <a
            href={gameExportUrl(slug)}
            className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
          >
            EXPORT GAME
          </a>
          <button
            onClick={() => setShowSyncSettings((v) => !v)}
            className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
          >
            SYNC SETTINGS
          </button>
          <button
            onClick={() => setShowLogUpdate(true)}
            className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium"
          >
            + LOG UPDATE
          </button>
        </div>
        {showSyncSettings && (
          <div className="flex items-center gap-2 pb-2 flex-wrap">
            <span className="font-mono text-[10px] text-text-faint">community data repo (app-wide, covers every game):</span>
            <input
              key={`owner-${syncSettings?.dataRepoOwner ?? ""}`}
              defaultValue={syncSettings?.dataRepoOwner ?? ""}
              onBlur={(e) => updateSyncSettings.mutate({ dataRepoOwner: e.target.value.trim() || null })}
              placeholder="github owner/org"
              className="bg-surface border border-white/10 rounded px-2 py-1 text-xs font-mono w-40"
            />
            <span className="text-text-faint text-xs">/</span>
            <input
              key={`name-${syncSettings?.dataRepoName ?? ""}`}
              defaultValue={syncSettings?.dataRepoName ?? ""}
              onBlur={(e) => updateSyncSettings.mutate({ dataRepoName: e.target.value.trim() || null })}
              placeholder="repo name"
              className="bg-surface border border-white/10 rounded px-2 py-1 text-xs font-mono w-40"
            />
          </div>
        )}
        <div className="flex gap-0.5 overflow-x-auto">
          {topLevelEntityOrder.map((key) => {
            const c = entityConfigs[key];
            const active = key === activeEntity;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveEntity(key);
                  setEditor(null);
                }}
                className={`px-3 py-1.5 font-sans font-semibold text-[11px] tracking-wide border-b-2 whitespace-nowrap ${
                  active ? "text-amber border-amber" : "text-text-dim border-transparent hover:text-text"
                }`}
              >
                {interpolateLabel(c.labelPlural, gameConfig.terms)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        <DataTable
          key={`${slug}-${activeEntity}`}
          config={config}
          onEditRow={(id) => setEditor({ mode: "edit", id })}
          onCreateNew={() => setEditor({ mode: "create" })}
        />
      </div>

      {editor && (
        <RecordEditor
          key={`${activeEntity}-${editor.mode === "edit" ? editor.id : "new"}`}
          config={config}
          id={editor.mode === "edit" ? editor.id : null}
          onClose={() => setEditor(null)}
          onCreated={(id) => setEditor({ mode: "edit", id })}
        />
      )}
      {showLogUpdate && <LogUpdateDialog onClose={() => setShowLogUpdate(false)} />}
    </div>
  );
}
