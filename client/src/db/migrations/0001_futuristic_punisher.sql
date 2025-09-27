CREATE TABLE "video_lectures" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"script" jsonb,
	"images" jsonb,
	"narration" jsonb,
	"music" jsonb,
	"effects" jsonb,
	"timeline" jsonb
);
--> statement-breakpoint
ALTER TABLE "video_lectures" ADD CONSTRAINT "video_lectures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;