CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`allocated_minutes` integer,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_worker_target` ON `assignments` (`worker_id`,`target_kind`,`target_id`) WHERE "assignments"."archived_at" IS NULL;