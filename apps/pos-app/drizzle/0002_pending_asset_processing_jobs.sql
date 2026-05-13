CREATE TABLE `pending_asset_processing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`source_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`source_mime_type` text,
	`processing_kind` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`attachment_field` text NOT NULL,
	`preview_path` text,
	`preview_mime_type` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pending_asset_processing_jobs_status_idx` ON `pending_asset_processing_jobs` (`status`);
--> statement-breakpoint
CREATE INDEX `pending_asset_processing_jobs_target_idx` ON `pending_asset_processing_jobs` (`entity_type`, `entity_id`, `attachment_field`);
