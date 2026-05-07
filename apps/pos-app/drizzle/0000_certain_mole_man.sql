CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`original_price` integer,
	`subtotal` integer NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`register_id` text,
	`staff_id` text,
	`order_number` text NOT NULL,
	`total` integer NOT NULL,
	`payment_method` text NOT NULL,
	`amount_paid` integer,
	`change_amount` integer,
	`status` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE TABLE `outlet_products` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price` integer,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`image_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `registers` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`name` text NOT NULL,
	`short_id` text NOT NULL,
	`pairing_code` text,
	`pairing_expires_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`outlet_id` text,
	`name` text NOT NULL,
	`pin` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`table_name` text NOT NULL,
	`outlet_id` text NOT NULL,
	`last_sync_at` text NOT NULL
);
