CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`email` text,
	`phone` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `client_contacts_client_idx` ON `client_contacts` (`client_id`);--> statement-breakpoint
ALTER TABLE `clients` ADD `email` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `website` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `address_line1` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `address_line2` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `city` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `region` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `postcode` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `country` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `notes` text;