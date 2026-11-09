CREATE TABLE `task_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `task_notifications_recipient_idx` ON `task_notifications` (`recipient_id`,`read_at`,`created_at`);