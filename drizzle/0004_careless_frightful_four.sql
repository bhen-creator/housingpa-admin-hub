ALTER TABLE `dailyReportRuns` MODIFY COLUMN `status` enum('NEVER_RUN','DRY_RUN_READY','QUEUED','RUNNING','DELIVERED','FAILED','FAILED_RETRYABLE','FAILED_FINAL','SKIPPED') NOT NULL;--> statement-breakpoint
ALTER TABLE `dailyReportSettings` MODIFY COLUMN `latestDeliveryStatus` enum('NEVER_RUN','DRY_RUN_READY','QUEUED','RUNNING','DELIVERED','FAILED','FAILED_RETRYABLE','FAILED_FINAL','SKIPPED') NOT NULL DEFAULT 'NEVER_RUN';--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `errorClass` varchar(96);--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `providerReceipt` varchar(512);--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `retryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `maxAttempts` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `nextAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `lastAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `reportFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `leaseToken` varchar(64);--> statement-breakpoint
ALTER TABLE `dailyReportRuns` ADD `leaseExpiresAt` timestamp;