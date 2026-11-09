ALTER TABLE `ticket_comments` ADD `request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_comments_request_id_unique` ON `ticket_comments` (`request_id`);