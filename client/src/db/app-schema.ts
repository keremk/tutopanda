import { integer, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),
});

export type InsertProject = typeof projectsTable.$inferInsert;
export type SelectProject = typeof projectsTable.$inferSelect;

export const videoLecturesTable = pgTable("video_lectures", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  script: jsonb("script"),
  images: jsonb("images"),
  narration: jsonb("narration"),
  music: jsonb("music"),
  effects: jsonb("effects"),
  timeline: jsonb("timeline"),
});

export type InsertVideoLecture = typeof videoLecturesTable.$inferInsert;
export type SelectVideoLecture = typeof videoLecturesTable.$inferSelect;
