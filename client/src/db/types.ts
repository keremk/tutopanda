import type {
  InsertLectureRevision,
  InsertVideoLecture,
  InsertWorkflowRun,
  SelectLectureRevision,
  SelectVideoLecture,
  SelectWorkflowRun,
} from "@/db/app-schema";

export type DbVideoLectureRow = SelectVideoLecture;
export type DbLectureRevisionRow = SelectLectureRevision;
export type DbWorkflowRunRow = SelectWorkflowRun;

export type DbInsertVideoLecture = InsertVideoLecture;
export type DbInsertLectureRevision = InsertLectureRevision;
export type DbInsertWorkflowRun = InsertWorkflowRun;
