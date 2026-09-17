CREATE TABLE `org_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`default_billable_rate_cents` integer,
	`default_day_minutes` integer DEFAULT 480 NOT NULL,
	`default_weekly_target_hours` integer,
	`updated_at` integer NOT NULL
);
