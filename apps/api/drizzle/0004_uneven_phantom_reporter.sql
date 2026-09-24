CREATE TABLE `ingested_update_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`path` text NOT NULL,
	`ingested_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`source` text NOT NULL,
	`created_count` integer NOT NULL,
	`updated_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data_repo_owner` text,
	`data_repo_name` text
);
--> statement-breakpoint
ALTER TABLE `redeem_codes` ADD `source` text DEFAULT 'manual' NOT NULL;