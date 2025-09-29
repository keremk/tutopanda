CREATE TABLE "lecture_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"lecture_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" text,
	"source" text DEFAULT 'app' NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"lecture_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"context" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_lectures" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_lectures" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lecture_revisions" ADD CONSTRAINT "lecture_revisions_lecture_id_video_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."video_lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_lecture_id_video_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."video_lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lecture_revision_unique" ON "lecture_revisions" USING btree ("lecture_id","revision");--> statement-breakpoint
CREATE INDEX "lecture_revisions_run_id_idx" ON "lecture_revisions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_lecture_id_idx" ON "workflow_runs" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");