CREATE TABLE `sync_cursors` (
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`last_server_event_id` integer DEFAULT 0 NOT NULL,
	`last_server_watermark` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`changed_at` text NOT NULL,
	`synced_at` text
);
