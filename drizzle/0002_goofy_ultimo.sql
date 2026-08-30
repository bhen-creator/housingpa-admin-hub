ALTER TABLE `internalTools` ADD `operationalState` enum('UNCONFIGURED','CONFIGURED_UNVERIFIED','VERIFIED_USABLE','BLOCKED') DEFAULT 'UNCONFIGURED' NOT NULL;--> statement-breakpoint
UPDATE `internalTools` SET `operationalState` = 'CONFIGURED_UNVERIFIED' WHERE TRIM(`destinationUrl`) <> '';--> statement-breakpoint
ALTER TABLE `internalTools` ADD `verificationEvidence` text;--> statement-breakpoint
ALTER TABLE `internalTools` ADD `verifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `internalTools` ADD `blockedReason` text;
