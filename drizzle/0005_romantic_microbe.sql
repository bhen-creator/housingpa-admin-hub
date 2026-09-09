CREATE TABLE `adminAuthState` (
	`id` int NOT NULL,
	`passwordScrypt` text NOT NULL,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adminAuthState_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `adminPasswordResetTokens` (
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminPasswordResetTokens_tokenHash` PRIMARY KEY(`tokenHash`)
);
