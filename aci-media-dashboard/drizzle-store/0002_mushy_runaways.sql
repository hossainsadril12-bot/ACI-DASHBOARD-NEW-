CREATE TABLE `atl_category` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`norm_name` text NOT NULL,
	`business_slug` text NOT NULL,
	`own_brand` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_slug`) REFERENCES `business`(`slug`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "atl_category_slug_length" CHECK(length("atl_category"."slug") BETWEEN 1 AND 60),
	CONSTRAINT "atl_category_name_length" CHECK(length("atl_category"."name") BETWEEN 1 AND 120),
	CONSTRAINT "atl_category_own_brand_length" CHECK(length("atl_category"."own_brand") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atl_category_norm_name_unique` ON `atl_category` (`norm_name`);--> statement-breakpoint
CREATE TABLE `brand` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_slug` text NOT NULL,
	`name` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`business_slug`) REFERENCES `business`(`slug`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "brand_name_length" CHECK(length("brand"."name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE `business` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "business_slug_length" CHECK(length("business"."slug") BETWEEN 1 AND 60),
	CONSTRAINT "business_name_length" CHECK(length("business"."name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE `name_match` (
	`kind` text NOT NULL,
	`norm_name` text NOT NULL,
	`name` text NOT NULL,
	`business_slug` text,
	`brand_id` integer,
	PRIMARY KEY(`kind`, `norm_name`),
	FOREIGN KEY (`business_slug`) REFERENCES `business`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `brand`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "name_match_target" CHECK(("name_match"."kind" = 'business' AND "name_match"."business_slug" IS NOT NULL AND "name_match"."brand_id" IS NULL) OR ("name_match"."kind" = 'brand' AND "name_match"."brand_id" IS NOT NULL AND "name_match"."business_slug" IS NULL)),
	CONSTRAINT "name_match_norm_name_length" CHECK(length("name_match"."norm_name") BETWEEN 1 AND 120),
	CONSTRAINT "name_match_name_length" CHECK(length("name_match"."name") BETWEEN 1 AND 120)
);
