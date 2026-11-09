CREATE TABLE `inventory_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_locations_name_unique` ON `inventory_locations` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`product_id` text NOT NULL,
	`source_id` text,
	`destination_id` text,
	`ticket_id` text,
	`quantity` integer NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `inventory_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_movement_quantity" CHECK("inventory_movements"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_movements_request_id_unique` ON `inventory_movements` (`request_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_product_idx` ON `inventory_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`minimum` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "inventory_minimum_nonnegative" CHECK("inventory_products"."minimum" >= 0)
);
--> statement-breakpoint
CREATE TABLE `inventory_stock` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `inventory_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_stock_nonnegative" CHECK("inventory_stock"."quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_stock_product_location` ON `inventory_stock` (`product_id`,`location_id`);