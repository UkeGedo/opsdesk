CREATE TABLE `ticket_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_categories_name_unique` ON `ticket_categories` (`name`);--> statement-breakpoint
CREATE TABLE `ticket_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "comment_visibility" CHECK("ticket_comments"."visibility" in ('interno','cliente'))
);
--> statement-breakpoint
CREATE INDEX `comments_ticket_idx` ON `ticket_comments` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`document_type` text,
	`document_number` text,
	`email` text,
	`phone` text,
	`address` text,
	`notes` text,
	`status` text DEFAULT 'activo' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "customer_status" CHECK("customers"."status" in ('activo','inactivo')),
	CONSTRAINT "customer_document_pair" CHECK(("customers"."document_type" is null and "customers"."document_number" is null) or ("customers"."document_type" is not null and "customers"."document_number" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_document_idx` ON `customers` (`document_type`,`document_number`);--> statement-breakpoint
CREATE INDEX `customer_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `ticket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `events_ticket_idx` ON `ticket_events` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` integer NOT NULL,
	`customer_id` text NOT NULL,
	`category_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`priority` text NOT NULL,
	`status` text DEFAULT 'abierto' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`assigned_to_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text,
	`closed_at` text,
	`archived_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `ticket_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_priority" CHECK("tickets"."priority" in ('baja','media','alta','urgente')),
	CONSTRAINT "ticket_status" CHECK("tickets"."status" in ('abierto','asignado','en_proceso','pendiente_cliente','resuelto','cerrado','reabierto'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_ticket_number_unique` ON `tickets` (`ticket_number`);--> statement-breakpoint
CREATE INDEX `tickets_customer_idx` ON `tickets` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'activo' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" in ('administrador','supervisor','tecnico','cliente')),
	CONSTRAINT "users_status" CHECK("users"."status" in ('activo','inactivo'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);