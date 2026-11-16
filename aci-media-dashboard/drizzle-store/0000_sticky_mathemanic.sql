CREATE TABLE `admin_session` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dataset` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`active_version_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`active_version_id`) REFERENCES `dataset_version`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dataset_key_length" CHECK(length("dataset"."key") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE `dataset_version` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_key` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`summary` text NOT NULL,
	`data` text NOT NULL,
	`file_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `upload_file`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "dataset_version_source_valid" CHECK("dataset_version"."source" IN ('upload', 'manual')),
	CONSTRAINT "dataset_version_key_length" CHECK(length("dataset_version"."dataset_key") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE INDEX `dataset_version_key_idx` ON `dataset_version` (`dataset_key`,`id`);--> statement-breakpoint
CREATE TABLE `login_lock` (
	`key` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "login_lock_failed_count_nonneg" CHECK("login_lock"."failed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upload_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "upload_file_size_positive" CHECK("upload_file"."size_bytes" > 0)
);
