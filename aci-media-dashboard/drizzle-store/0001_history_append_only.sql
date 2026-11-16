CREATE TRIGGER `dataset_version_no_update` BEFORE UPDATE ON `dataset_version`
BEGIN SELECT RAISE(ABORT, 'Upload History cannot be changed.'); END;
--> statement-breakpoint
CREATE TRIGGER `dataset_version_no_delete` BEFORE DELETE ON `dataset_version`
BEGIN SELECT RAISE(ABORT, 'Upload History cannot be deleted.'); END;
--> statement-breakpoint
CREATE TRIGGER `upload_file_no_update` BEFORE UPDATE ON `upload_file`
BEGIN SELECT RAISE(ABORT, 'Uploaded files cannot be changed.'); END;
--> statement-breakpoint
CREATE TRIGGER `upload_file_no_delete` BEFORE DELETE ON `upload_file`
BEGIN SELECT RAISE(ABORT, 'Uploaded files cannot be deleted.'); END;
