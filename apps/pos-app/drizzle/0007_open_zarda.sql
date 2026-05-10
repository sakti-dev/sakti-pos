ALTER TABLE `outlets` ADD `timezone` text DEFAULT 'Asia/Jakarta' NOT NULL;
--> statement-breakpoint
UPDATE `outlets`
SET `timezone` = 'Asia/Jakarta'
WHERE `timezone` IS NULL OR `timezone` = '';
