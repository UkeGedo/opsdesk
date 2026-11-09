ALTER TABLE `audit_logs` ADD `resource_type` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `outcome` text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `context` text;
--> statement-breakpoint
UPDATE audit_logs SET resource_type = substr(action, 1, instr(action, '.') - 1) WHERE instr(action, '.') > 0;
