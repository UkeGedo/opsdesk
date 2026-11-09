CREATE TABLE `priority_matrices` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`matrix` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `priority_matrices_version_idx` ON `priority_matrices` (`version`);--> statement-breakpoint
CREATE TABLE `ticket_priority_data` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`impact` text NOT NULL,
	`urgency` text NOT NULL,
	`calculated_priority` text NOT NULL,
	`explanation` text NOT NULL,
	`matrix_version` integer NOT NULL,
	`matrix_snapshot` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict
);
