CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor_units` integer NOT NULL,
	`category` text,
	`reference_id` text,
	`notes` text,
	`created_by_staff_id` text NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallet_transactions_scope_sync_idx` ON `wallet_transactions` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `wallet_transactions_wallet_created_idx` ON `wallet_transactions` (`wallet_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_number` text,
	`is_default` integer DEFAULT false NOT NULL,
	`current_balance_minor_units` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `wallets_scope_sync_idx` ON `wallets` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `wallets_outlet_type_idx` ON `wallets` (`outlet_id`,`type`);--> statement-breakpoint
ALTER TABLE `orders` ADD `wallet_id` text;