ALTER TABLE "video_lectures" ADD COLUMN "title" text DEFAULT 'Untitled Lecture' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_lectures" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "video_lectures" ADD COLUMN "config" jsonb;