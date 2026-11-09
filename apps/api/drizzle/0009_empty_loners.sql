CREATE TABLE `inventory_asset_events` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `inventory_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `asset_event_asset_idx` ON `inventory_asset_events` (`asset_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`serial` text NOT NULL,
	`location_id` text NOT NULL,
	`assigned_to` text,
	`ticket_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_assets_serial_unique` ON `inventory_assets` (`serial`);