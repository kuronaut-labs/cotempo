CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rate_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
ALTER TABLE `human_workers` ADD `position_id` text REFERENCES positions(id);