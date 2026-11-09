CREATE TABLE `sla_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`priority` text,
	`effective_from` text NOT NULL,
	`effective_until` text,
	`active` integer DEFAULT true NOT NULL,
	`first_response_ms` integer NOT NULL,
	`resolution_ms` integer NOT NULL,
	`calendar` text NOT NULL,
	`pause_statuses` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sla_policy_targets" CHECK("sla_policies"."first_response_ms" > 0 and "sla_policies"."resolution_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE `ticket_sla_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`sla_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`sla_id`) REFERENCES `ticket_slas`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ticket_sla_pauses_sla_idx` ON `ticket_sla_pauses` (`sla_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `ticket_slas` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`started_at` text NOT NULL,
	`first_response_at` text,
	`resolved_at` text,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`policy_id`) REFERENCES `sla_policies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ticket_slas_ticket_idx` ON `ticket_slas` (`ticket_id`,`started_at`);