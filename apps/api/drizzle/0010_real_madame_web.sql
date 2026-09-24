PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_character_level_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`kind` text DEFAULT 'material' NOT NULL,
	`material_id` integer,
	`quantity` integer,
	`exp_amount` integer,
	`source` text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_character_level_costs`("id", "game_id", "character_id", "from_level", "to_level", "material_id", "quantity", "source") SELECT "id", "game_id", "character_id", "from_level", "to_level", "material_id", "quantity", "source" FROM `character_level_costs`;--> statement-breakpoint
DROP TABLE `character_level_costs`;--> statement-breakpoint
ALTER TABLE `__new_character_level_costs` RENAME TO `character_level_costs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_equipment_level_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`equipment_item_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`kind` text DEFAULT 'material' NOT NULL,
	`material_id` integer,
	`quantity` integer,
	`exp_amount` integer,
	`source` text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_equipment_level_costs`("id", "game_id", "equipment_item_id", "from_level", "to_level", "material_id", "quantity", "source") SELECT "id", "game_id", "equipment_item_id", "from_level", "to_level", "material_id", "quantity", "source" FROM `equipment_level_costs`;--> statement-breakpoint
DROP TABLE `equipment_level_costs`;--> statement-breakpoint
ALTER TABLE `__new_equipment_level_costs` RENAME TO `equipment_level_costs`;--> statement-breakpoint
ALTER TABLE `materials` ADD `exp_value` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `exp_usage` text;