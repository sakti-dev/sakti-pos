DROP INDEX `orders_order_number_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_outlet_number_unique` ON `orders` (`outlet_id`,`order_number`);