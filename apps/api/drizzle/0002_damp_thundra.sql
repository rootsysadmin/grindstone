CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`purchased_at` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_method` text,
	`granted_kind` text DEFAULT 'none' NOT NULL,
	`granted_currency_id` integer,
	`granted_amount` integer,
	`is_impulse` integer DEFAULT false NOT NULL,
	`notes` text,
	`subscription_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spend_budget_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`budget_id` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spend_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text,
	`kind` text NOT NULL,
	`cap_cents` integer NOT NULL,
	`action` text DEFAULT 'warn' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spend_game_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`quit_at` integer,
	`warn_on_lost_5050` integer DEFAULT true NOT NULL,
	`warn_recent_purchase` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spend_game_settings_game_idx` ON `spend_game_settings` (`game_id`);--> statement-breakpoint
CREATE TABLE `spend_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`label` text NOT NULL,
	`cadence` text DEFAULT 'monthly' NOT NULL,
	`custom_cadence_label` text,
	`interval_days` integer,
	`price_cents` integer NOT NULL,
	`granted_kind` text DEFAULT 'none' NOT NULL,
	`granted_currency_id` integer,
	`granted_amount` integer,
	`linked_income_source_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
