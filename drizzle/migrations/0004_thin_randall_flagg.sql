CREATE TABLE `interval_events` (
	`id` text PRIMARY KEY NOT NULL,
	`interval_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_worker_id` text NOT NULL,
	`changes` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`interval_id`) REFERENCES `intervals`(`id`) ON UPDATE no action ON DELETE no action
);
