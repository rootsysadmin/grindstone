import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { EntityConfig, EntityKey } from "@grindstone/shared";
import { entityConfigs } from "@grindstone/shared";
import {
  banners,
  characters,
  currencies,
  elements,
  equipmentItems,
  events,
  materials,
  modules,
  rankTiers,
  skills,
} from "../db/schema.js";

export const entityTables: Record<EntityKey, SQLiteTable> = {
  characters,
  equipmentItems,
  materials,
  skills,
  modules,
  elements,
  rankTiers,
  currencies,
  banners,
  events,
};

export interface RegisteredEntity {
  key: EntityKey;
  config: EntityConfig;
  table: SQLiteTable;
}

export const apiPathToEntity = new Map<string, RegisteredEntity>(
  (Object.keys(entityConfigs) as EntityKey[]).map((key) => {
    const config = entityConfigs[key];
    return [config.apiPath, { key, config, table: entityTables[key] }];
  }),
);
