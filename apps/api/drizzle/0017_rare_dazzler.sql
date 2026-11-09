CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category_id` text NOT NULL,
	`responsible_team` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`default_priority` text NOT NULL,
	`form_version` integer DEFAULT 1 NOT NULL,
	`form_schema` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `ticket_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `ticket_service_data` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`request_type` text NOT NULL,
	`form_snapshot` text NOT NULL,
	`values` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `sla_policies` ADD `service_id` text REFERENCES services(id);