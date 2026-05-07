ALTER TABLE `categories` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `deleted_at` text;