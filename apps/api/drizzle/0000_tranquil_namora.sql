CREATE TABLE `banners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`type` text,
	`featured_character_id` integer,
	`featured_equipment_id` integer,
	`start_date` text,
	`end_date` text,
	`pity` integer,
	`soft_pity` integer,
	`fifty_fifty` integer DEFAULT true NOT NULL,
	`carries_pity` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `banners_game_slug_idx` ON `banners` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `battle_pass_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`current_level` integer DEFAULT 0 NOT NULL,
	`max_level` integer DEFAULT 50 NOT NULL,
	`end_date` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `battle_pass_progress_game_idx` ON `battle_pass_progress` (`game_id`);--> statement-breakpoint
CREATE TABLE `character_builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`resonance_level` integer DEFAULT 0 NOT NULL,
	`equipped_equipment_item_id` integer,
	`equipped_equipment_level` integer,
	`equipped_equipment_refinement` integer,
	`notes` text,
	`pinned` integer DEFAULT false NOT NULL,
	`owned_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_builds_game_character_idx` ON `character_builds` (`game_id`,`character_id`);--> statement-breakpoint
CREATE TABLE `character_level_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_skill_levels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`skill_id` integer NOT NULL,
	`level` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_skill_levels_game_char_skill_idx` ON `character_skill_levels` (`game_id`,`character_id`,`skill_id`);--> statement-breakpoint
CREATE TABLE `character_stat_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`character_id` integer NOT NULL,
	`stat_name` text NOT NULL,
	`target_value` text,
	`current_value` text
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`rank` text,
	`element_id` integer,
	`role` text,
	`equipment_type` text,
	`release_date` text,
	`ascension_material_id` integer,
	`max_augment_slots` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_game_slug_idx` ON `characters` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `currencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`category` text,
	`short_code` text,
	`pull_cost` integer,
	`converts_to_id` integer,
	`conversion_rate` text,
	`spends_on` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `currencies_game_slug_idx` ON `currencies` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `currency_inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`currency_id` integer NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `currency_inventory_game_currency_idx` ON `currency_inventory` (`game_id`,`currency_id`);--> statement-breakpoint
CREATE TABLE `elements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`colour` text,
	`short_code` text,
	`strong_vs_element_id` integer,
	`ascension_material_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `elements_game_slug_idx` ON `elements` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `equipment_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`rank` text,
	`type` text,
	`main_stat` text,
	`passive_text` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_items_game_slug_idx` ON `equipment_items` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `equipment_level_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`equipment_item_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_progress_event_idx` ON `event_progress` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`kind` text NOT NULL,
	`currency_id` integer,
	`material_id` integer,
	`quantity` integer
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`kind` text,
	`start_date` text,
	`end_date` text,
	`stage_count` integer,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_game_slug_idx` ON `events` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `farm_route_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`label` text NOT NULL,
	`target_label` text,
	`for_label` text,
	`planned_runs` integer DEFAULT 1 NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`max_character_level` integer NOT NULL,
	`max_skill_level` integer NOT NULL,
	`max_equipment_level` integer NOT NULL,
	`max_resonance_level` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_settings_game_idx` ON `game_settings` (`game_id`);--> statement-breakpoint
CREATE TABLE `income_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`income_source_id` integer NOT NULL,
	`claimed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`currency_id` integer NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`custom_cadence_label` text,
	`interval_days` integer,
	`amount_per_event` integer,
	`category` text DEFAULT 'Guaranteed' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`reliability_percent` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `material_inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_inventory_game_material_idx` ON `material_inventory` (`game_id`,`material_id`);--> statement-breakpoint
CREATE TABLE `material_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`material_id` integer NOT NULL,
	`name` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`tier` integer,
	`category` text,
	`weekly_cap` integer,
	`crafts_into_id` integer,
	`alternative_material_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_game_slug_idx` ON `materials` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `module_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`module_id` integer NOT NULL,
	`for_character_id` integer,
	`label` text NOT NULL,
	`main_stat_target` text,
	`substats` text,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`piece_type` text DEFAULT 'Module' NOT NULL,
	`set_name` text,
	`slot` text,
	`set_piece_count` integer,
	`main_stat` text,
	`max_level` integer,
	`set_bonus_text` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_game_slug_idx` ON `modules` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `owned_augments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`module_id` integer NOT NULL,
	`main_stat` text,
	`substats` text,
	`level` integer,
	`character_id` integer,
	`slot_index` integer,
	`acquired_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pull_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`banner_id` integer NOT NULL,
	`rank` text,
	`item_type` text DEFAULT 'other' NOT NULL,
	`item_id` integer,
	`item_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`pity_at_pull` integer,
	`fifty_fifty_result` text,
	`pulled_at` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `redeem_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`code` text NOT NULL,
	`reward_label` text,
	`redeemed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_level_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`skill_id` integer NOT NULL,
	`from_level` integer NOT NULL,
	`to_level` integer NOT NULL,
	`material_id` integer NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`skill_id` integer NOT NULL,
	`material_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`character_id` integer NOT NULL,
	`slot` text,
	`max_level` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_game_slug_idx` ON `skills` (`game_id`,`slug`);--> statement-breakpoint
CREATE TABLE `task_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`task_id` integer NOT NULL,
	`period_key` text NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_progress_task_period_idx` ON `task_progress` (`task_id`,`period_key`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`cadence` text NOT NULL,
	`label` text NOT NULL,
	`target` integer DEFAULT 1 NOT NULL,
	`reward_kind` text,
	`reward_currency_id` integer,
	`reward_material_id` integer,
	`reward_quantity` integer,
	`for_label` text,
	`from_game` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`team_id` integer NOT NULL,
	`character_id` integer NOT NULL,
	`role_label` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
