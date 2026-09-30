CREATE TABLE `modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL REFERENCES merchants(`id`) ON UPDATE no action ON DELETE no action,
	`name` text NOT NULL,
	`selection_type` text NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sync_updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `modifier_groups_scope_sync_idx` ON `modifier_groups` (`merchant_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE INDEX `modifier_groups_merchant_sort_idx` ON `modifier_groups` (`merchant_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `modifier_options` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL REFERENCES merchants(`id`) ON UPDATE no action ON DELETE no action,
	`group_id` text NOT NULL REFERENCES modifier_groups(`id`) ON UPDATE no action ON DELETE no action,
	`label` text NOT NULL,
	`price_delta_minor_units` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sync_updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `modifier_options_scope_sync_idx` ON `modifier_options` (`merchant_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE INDEX `modifier_options_group_sort_idx` ON `modifier_options` (`group_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `product_modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL REFERENCES merchants(`id`) ON UPDATE no action ON DELETE no action,
	`product_id` text NOT NULL REFERENCES products(`id`) ON UPDATE no action ON DELETE no action,
	`group_id` text NOT NULL REFERENCES modifier_groups(`id`) ON UPDATE no action ON DELETE no action,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sync_updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_modifier_groups_scope_sync_idx` ON `product_modifier_groups` (`merchant_id`,`sync_updated_at`);
--> statement-breakpoint
CREATE INDEX `product_modifier_groups_product_idx` ON `product_modifier_groups` (`product_id`,`sort_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_modifier_groups_product_group_unique` ON `product_modifier_groups` (`product_id`,`group_id`);
