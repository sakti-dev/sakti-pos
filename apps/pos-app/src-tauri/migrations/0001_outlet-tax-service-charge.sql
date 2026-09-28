ALTER TABLE `orders` ADD `tax_minor_units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `service_charge_minor_units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tax_percentage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `service_charge_percentage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `outlets` ADD `use_service_charge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `outlets` ADD `service_charge_percentage` integer DEFAULT 0 NOT NULL;
