PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_items` (
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
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "order_id", "outlet_id", "product_id", "product_name", "quantity", "unit_price", "original_price", "subtotal", "created_at", "updated_at", "deleted_at") SELECT "id", "order_id", "outlet_id", "product_id", "product_name", "quantity", "unit_price", "original_price", "subtotal", "created_at", "updated_at", "deleted_at" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `outlets` ADD `timezone` text DEFAULT 'Asia/Jakarta' NOT NULL;
--> statement-breakpoint
UPDATE `outlets`
SET `timezone` = 'Asia/Jakarta'
WHERE `timezone` IS NULL OR `timezone` = '';
