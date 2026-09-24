CREATE TABLE `rank_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text,
	`level` integer NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tiers_game_slug_idx` ON `rank_tiers` (`game_id`,`slug`);--> statement-breakpoint
ALTER TABLE `characters` ADD `rank_tier_id` integer;--> statement-breakpoint
ALTER TABLE `currencies` ADD `rank_tier_id` integer;--> statement-breakpoint
ALTER TABLE `equipment_items` ADD `rank_tier_id` integer;--> statement-breakpoint
ALTER TABLE `materials` ADD `rank_tier_id` integer;