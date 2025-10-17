import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { title } from "process";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),
  isDefault: boolean("is_default").notNull().default(false),
  settings: jsonb("settings"),
});

export type InsertProject = typeof projectsTable.$inferInsert;
export type SelectProject = typeof projectsTable.$inferSelect;

export const videoLecturesTable = pgTable("video_lectures", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }), 
  title: text("title").notNull().default("Untitled Lecture"),
  prompt: text("prompt"),
  summary: text("summary"),
  script: jsonb("script"),
  images: jsonb("images"),
  narration: jsonb("narration"),
  videos: jsonb("videos"),
  music: jsonb("music"),
  effects: jsonb("effects"),
  timeline: jsonb("timeline"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InsertVideoLecture = typeof videoLecturesTable.$inferInsert;
export type SelectVideoLecture = typeof videoLecturesTable.$inferSelect;

export const lectureRevisionsTable = pgTable(
  "lecture_revisions",
  {
    id: serial("id").primaryKey(),
    lectureId: integer("lecture_id")
      .notNull()
      .references(() => videoLecturesTable.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    data: jsonb("data").notNull(),
    createdBy: text("created_by"),
    source: text("source").notNull().default("app"),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [  
    uniqueIndex("lecture_revision_unique").on(table.lectureId, table.revision),
    index("lecture_revisions_run_id_idx").on(table.runId),
  ]
);

export type InsertLectureRevision = typeof lectureRevisionsTable.$inferInsert;
export type SelectLectureRevision = typeof lectureRevisionsTable.$inferSelect;

export const workflowRunsTable = pgTable(
  "workflow_runs",
  {
    runId: text("run_id").primaryKey(),
    lectureId: integer("lecture_id")
      .notNull()
      .references(() => videoLecturesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("queued"),
    currentStep: integer("current_step").notNull().default(0),
    totalSteps: integer("total_steps").notNull().default(0),
    context: jsonb("context"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflow_runs_lecture_id_idx").on(table.lectureId),
    index("workflow_runs_status_idx").on(table.status),
  ]
);

export type InsertWorkflowRun = typeof workflowRunsTable.$inferInsert;
export type SelectWorkflowRun = typeof workflowRunsTable.$inferSelect;
