CREATE TABLE `dailyReportRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` varchar(64) NOT NULL,
	`trigger` enum('MANUAL_DRY_RUN','SCHEDULED') NOT NULL,
	`status` enum('NEVER_RUN','DRY_RUN_READY','QUEUED','DELIVERED','FAILED','SKIPPED') NOT NULL,
	`scheduledFor` timestamp,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`deliveryResult` text,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyReportRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `dailyReportRuns_runId_unique` UNIQUE(`runId`)
);
--> statement-breakpoint
CREATE TABLE `dailyReportSettings` (
	`id` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`scheduleTime` varchar(5) NOT NULL DEFAULT '06:00',
	`timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
	`recipient` varchar(320) NOT NULL DEFAULT '',
	`lastRunAt` timestamp,
	`latestDeliveryStatus` enum('NEVER_RUN','DRY_RUN_READY','QUEUED','DELIVERED','FAILED','SKIPPED') NOT NULL DEFAULT 'NEVER_RUN',
	`latestError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyReportSettings_id` PRIMARY KEY(`id`)
);
