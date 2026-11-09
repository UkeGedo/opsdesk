CREATE TABLE `inventory_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`product_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `inventory_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `inventory_alerts_recipient_idx` ON `inventory_alerts` (`recipient_id`,`read_at`,`created_at`);