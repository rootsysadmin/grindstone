CREATE TABLE `savings_rule_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`rule_id` integer NOT NULL,
	`target_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `savings_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`threshold` integer,
	`scope_banner_type` text,
	`action` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wishlist_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`target_character_id` integer,
	`target_equipment_id` integer,
	`banner_id` integer,
	`priority` integer NOT NULL,
	`copies_wanted` integer DEFAULT 1 NOT NULL,
	`budget_ceiling_pulls` integer NOT NULL,
	`reserve_from_today` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`resolved_at` integer,
	`locked_decision` text,
	`locked_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
