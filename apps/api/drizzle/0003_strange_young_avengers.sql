CREATE TABLE `purchase_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`kind` text NOT NULL,
	`currency_id` integer,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`kind` text NOT NULL,
	`currency_id` integer,
	`amount` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `granted_kind`;--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `granted_currency_id`;--> statement-breakpoint
ALTER TABLE `purchases` DROP COLUMN `granted_amount`;--> statement-breakpoint
ALTER TABLE `spend_subscriptions` DROP COLUMN `granted_kind`;--> statement-breakpoint
ALTER TABLE `spend_subscriptions` DROP COLUMN `granted_currency_id`;--> statement-breakpoint
ALTER TABLE `spend_subscriptions` DROP COLUMN `granted_amount`;