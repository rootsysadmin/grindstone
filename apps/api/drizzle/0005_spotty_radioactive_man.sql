CREATE TABLE `code_rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`code_id` integer NOT NULL,
	`kind` text NOT NULL,
	`currency_id` integer,
	`material_id` integer,
	`quantity` integer
);
