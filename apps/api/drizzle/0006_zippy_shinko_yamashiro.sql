ALTER TABLE `character_level_costs` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment_level_costs` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `skill_level_costs` ADD `source` text DEFAULT 'manual' NOT NULL;