CREATE TABLE `internalTools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`destinationUrl` varchar(2048) NOT NULL DEFAULT '',
	`category` enum('featured','future') NOT NULL DEFAULT 'future',
	`sortOrder` int NOT NULL DEFAULT 100,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internalTools_id` PRIMARY KEY(`id`),
	CONSTRAINT `internalTools_slug_unique` UNIQUE(`slug`)
);
