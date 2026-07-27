CREATE TABLE `WiseOSLogEvent` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`event_id` varchar(255) NOT NULL,
	`schema_version` int NOT NULL,
	`event_timestamp` timestamp NOT NULL,
	`ingested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`imei` varchar(32) NOT NULL,
	`ip_address` varchar(45) NOT NULL,
	`app_version` varchar(50) NOT NULL,
	`os_version` varchar(50) NOT NULL,
	`boot_id` varchar(128) NOT NULL,
	`device_name` varchar(255) NOT NULL,
	`domain` varchar(100) NOT NULL,
	`event_code` varchar(100) NOT NULL,
	`severity` enum('DEBUG','INFO','WARN','ERROR','CRITICAL','FATAL') NOT NULL,
	`status` enum('SUCCESS','FAILED') NOT NULL,
	`submission_id` varchar(128) NOT NULL,
	`batch_id` varchar(128) NOT NULL,
	`buffer_id` varchar(128) NOT NULL,
	`message` text,
	`metadata` json NOT NULL,
	CONSTRAINT `WiseOSLogEvent_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_wiseos_log_event_imei_event` UNIQUE(`imei`,`event_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_timestamp` ON `WiseOSLogEvent` (`event_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_event_id` ON `WiseOSLogEvent` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_imei` ON `WiseOSLogEvent` (`imei`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_boot_id` ON `WiseOSLogEvent` (`boot_id`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_domain` ON `WiseOSLogEvent` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_event_code` ON `WiseOSLogEvent` (`event_code`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_severity` ON `WiseOSLogEvent` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_status` ON `WiseOSLogEvent` (`status`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_submission_id` ON `WiseOSLogEvent` (`submission_id`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_domain_code` ON `WiseOSLogEvent` (`domain`,`event_code`);--> statement-breakpoint
CREATE INDEX `idx_wiseos_log_event_imei_timestamp` ON `WiseOSLogEvent` (`imei`,`event_timestamp`);