import { useRef, useState } from "react";
import type { EntityConfig, MasterDataRow } from "@grindstone/shared";
import { interpolateLabel } from "@grindstone/shared";
import { csvExportUrl, jsonExportUrl, useDeleteRow, useDuplicateRow, useEntityList, useImportCsv, useImportJson, useRankTierMap, useRelationOptions } from "./api.ts";
import { SourceBadge, StatusBadge } from "./Badges.tsx";
import { DuplicateRowDialog } from "./DuplicateRowDialog.tsx";
import { useActiveGame } from "../../state/gameContext.tsx";
import { MaterialSwatch } from "../../components/MaterialSwatch.tsx";
import { RankBadge, RarityFrame } from "../../components/rankVisuals.tsx";

function isIncomplete(config: EntityConfig, row: MasterDataRow): boolean {
  return config.fields.some((f) => f.required && (row[f.key] === null || row[f.key] === undefined || row[f.key] === ""));
}

type SortKey = "name" | "source" | "updatedAt" | (string & {});
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** Numeric-aware, null-last comparator — used for every column so a number-typed field (e.g. tier) doesn't sort as text and an unset value doesn't dominate one end of the list. */
function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

export function DataTable({
  config,
  onEditRow,
  onCreateNew,
}: {
  config: EntityConfig;
  onEditRow: (id: number) => void;
  onCreateNew: () => void;
}) {
  const { slug: game, config: gameConfig } = useActiveGame();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;
  if (sourceFilter) params.source = sourceFilter;

  const { data: rows = [], isLoading } = useEntityList(config, params);
  const relationOptions = useRelationOptions(config);
  const rankTierMap = useRankTierMap();
  const hasRank = config.fields.some((f) => f.relationEntity === "rankTiers");
  const deleteRow = useDeleteRow(config);
  const duplicateRow = useDuplicateRow(config);
  const importCsv = useImportCsv(config);
  const importJson = useImportJson(config);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [duplicatingRow, setDuplicatingRow] = useState<MasterDataRow | null>(null);

  const tableFields = config.fields.filter((f) => f.inTable !== false && f.key !== "name");
  const incompleteCount = rows.filter((r) => isIncomplete(config, r)).length;

  function relationLabel(fieldKey: string, id: unknown) {
    if (id === null || id === undefined) return "— unset";
    const opts = relationOptions[fieldKey] ?? [];
    return opts.find((o) => o.id === id)?.name ?? `#${id}`;
  }

  /** Cycles a column asc -> desc -> off (back to server/insertion order), matching how sortable list UIs elsewhere in the app behave. */
  function toggleSort(key: SortKey) {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function sortValueFor(row: MasterDataRow, key: SortKey): unknown {
    const field = config.fields.find((f) => f.key === key);
    if (field?.relationEntity === "rankTiers") {
      const id = row[key] as number | null;
      return id === null || id === undefined ? null : (rankTierMap.get(id)?.level ?? null);
    }
    if (field?.type === "relation") return relationLabel(key, row[key]);
    return row[key];
  }

  const sortedRows = sort
    ? [...rows].sort((a, b) => compareValues(sortValueFor(a, sort.key), sortValueFor(b, sort.key)) * (sort.dir === "asc" ? 1 : -1))
    : rows;

  function SortIndicator({ column }: { column: SortKey }) {
    if (sort?.key !== column) return null;
    return <span className="text-amber ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`filter ${rows.length} rows`}
          className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs font-mono w-52 outline-none focus:border-blue/50"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono"
        >
          <option value="">STATUS: ALL</option>
          <option value="published">PUBLISHED</option>
          <option value="draft">DRAFT</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-surface border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono"
        >
          <option value="">SOURCE: ALL</option>
          <option value="auto">AUTO</option>
          <option value="manual">MANUAL</option>
          <option value="override">OVERRIDE</option>
        </select>
        {incompleteCount > 0 && (
          <span className="text-xs font-mono px-2 py-1 rounded-md bg-pink/10 border border-pink/30 text-pink">
            ⚠ {incompleteCount} incomplete
          </span>
        )}
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importCsv.mutate(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
        >
          IMPORT CSV
        </button>
        <a
          href={csvExportUrl(game, config)}
          className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
        >
          EXPORT CSV
        </a>
        <input
          ref={jsonFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson.mutate(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => jsonFileInputRef.current?.click()}
          title="Includes this entity's sub-item data (level costs, targets, rewards, sources) — same shape as a full-game bundle/seed file, scoped to this table."
          className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
        >
          IMPORT JSON
        </button>
        <a
          href={jsonExportUrl(game, config)}
          title="Includes this entity's sub-item data (level costs, targets, rewards, sources) — same shape as a full-game bundle/seed file, scoped to this table."
          className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-text-dim hover:bg-white/10"
        >
          EXPORT JSON
        </a>
        <button
          onClick={onCreateNew}
          className="text-xs font-mono px-2.5 py-1.5 rounded-md bg-amber text-ink font-medium"
        >
          + NEW ROW
        </button>
      </div>

      <div className="border border-border2 rounded-lg overflow-hidden bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border2 text-text-faint font-mono uppercase tracking-wide text-[10px]">
                {config.hasImage && <th className="p-2 text-left w-10">Img</th>}
                <th className="p-2 text-left cursor-pointer select-none hover:text-text" onClick={() => toggleSort("name")}>
                  Name
                  <SortIndicator column="name" />
                </th>
                {tableFields.map((f) => (
                  <th key={f.key} className="p-2 text-left cursor-pointer select-none hover:text-text" onClick={() => toggleSort(f.key)}>
                    {interpolateLabel(f.label, gameConfig.terms)}
                    <SortIndicator column={f.key} />
                  </th>
                ))}
                <th className="p-2 text-left cursor-pointer select-none hover:text-text" onClick={() => toggleSort("source")}>
                  Source
                  <SortIndicator column="source" />
                </th>
                <th className="p-2 text-right cursor-pointer select-none hover:text-text" onClick={() => toggleSort("updatedAt")}>
                  Updated
                  <SortIndicator column="updatedAt" />
                </th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="p-3 text-text-dim" colSpan={10}>
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td className="p-3 text-text-dim" colSpan={10}>
                    No rows yet.
                  </td>
                </tr>
              )}
              {sortedRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onEditRow(row.id)}
                  className={`border-b border-border2 last:border-0 cursor-pointer hover:bg-white/5 ${
                    isIncomplete(config, row) ? "bg-pink/5" : ""
                  }`}
                >
                  {config.hasImage && (
                    <td className="p-2">
                      {config.key === "materials" ? (
                        <MaterialSwatch
                          material={{ color: rankTierMap.get(row.rankTierId as number)?.color ?? null, imageUrl: row.imageUrl as string | null, name: row.name }}
                          size={24}
                        />
                      ) : (
                        <RarityFrame tier={hasRank ? (rankTierMap.get(row.rankTierId as number) ?? null) : null} className="w-6 h-6 rounded overflow-hidden">
                          {row.imageUrl ? (
                            <img src={String(row.imageUrl)} className="w-6 h-6 rounded object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded border border-dashed border-white/15" />
                          )}
                        </RarityFrame>
                      )}
                    </td>
                  )}
                  <td className="p-2 font-medium">
                    {row.name}
                    {row.status === "draft" && <span className="ml-1.5 inline-block align-middle"><StatusBadge status={row.status} /></span>}
                  </td>
                  {tableFields.map((f) => (
                    <td key={f.key} className="p-2 text-text-dim">
                      {f.relationEntity === "rankTiers"
                        ? <RankBadge tier={rankTierMap.get(row[f.key] as number) ?? null} />
                        : f.type === "relation"
                          ? relationLabel(f.key, row[f.key])
                          : f.type === "boolean"
                            ? row[f.key]
                              ? "yes"
                              : "no"
                            : row[f.key] === null || row[f.key] === undefined || row[f.key] === ""
                              ? "— unset"
                              : String(row[f.key])}
                    </td>
                  ))}
                  <td className="p-2">
                    <SourceBadge source={row.source} />
                  </td>
                  <td className="p-2 text-right font-mono text-text-faint">
                    {new Date(row.updatedAt * 1000).toLocaleDateString()}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDuplicatingRow(row);
                      }}
                      className="text-text-dim hover:text-text font-mono text-[11px] mr-3"
                    >
                      duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${row.name}"?`)) deleteRow.mutate(row.id);
                      }}
                      className="text-pink/70 hover:text-pink font-mono text-[11px]"
                    >
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {duplicatingRow && (
        <DuplicateRowDialog
          sourceName={duplicatingRow.name}
          busy={duplicateRow.isPending}
          onCancel={() => setDuplicatingRow(null)}
          onConfirm={(name) => duplicateRow.mutate({ id: duplicatingRow.id, name }, { onSuccess: () => setDuplicatingRow(null) })}
        />
      )}
    </div>
  );
}
