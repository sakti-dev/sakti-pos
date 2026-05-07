CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
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
	`created_at` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registers_short_id_unique` ON `registers` (`short_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registers_pairing_code_unique` ON `registers` (`pairing_code`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`outlet_id` text,
	`name` text NOT NULL,
	`pin` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`password_hash` text,
	`google_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);