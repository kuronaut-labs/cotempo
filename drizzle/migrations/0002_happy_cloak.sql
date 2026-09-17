CREATE TABLE `leave_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_worker_id` text NOT NULL,
	`reason` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `leave_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`type_id` text NOT NULL,
	`start_day` text NOT NULL,
	`end_day` text NOT NULL,
	`minutes_per_day` integer NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`reason` text,
	`submitted_at` integer NOT NULL,
	`submitted_by` text NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`decision_reason` text,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leave_requests_worker_status_idx` ON `leave_requests` (`worker_id`,`status`);--> statement-breakpoint
CREATE INDEX `leave_requests_status_idx` ON `leave_requests` (`status`);--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`paid` integer DEFAULT true NOT NULL,
	`accrual_method` text DEFAULT 'monthly_prorata' NOT NULL,
	`minutes_per_year` integer DEFAULT 0 NOT NULL,
	`accrual_rate_per_10k` integer DEFAULT 0 NOT NULL,
	`max_carry_over_minutes` integer DEFAULT 0 NOT NULL,
	`year_basis` text DEFAULT 'calendar' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_key_unique` ON `leave_types` (`key`);