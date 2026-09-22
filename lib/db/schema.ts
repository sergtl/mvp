import type { ExtractedCV, ParseStatus } from "../cv/extraction-schema";
import type { Profile } from "../profile/schema";
import { boolean, bytea, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const cv = pgTable("cv", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("cv_user_created_idx").on(table.userId, table.createdAt),
  check("cv_size_check", sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 10485760`),
]);

// Keep binary contents separate so metadata queries never fetch entire files.
export const cvFile = pgTable("cv_file", {
  cvId: uuid("cv_id").primaryKey().references(() => cv.id, { onDelete: "cascade" }),
  content: bytea("content").notNull(),
});


export const cvParse = pgTable("cv_parse", {
  id: uuid("id").defaultRandom().primaryKey(),
  cvId: uuid("cv_id").notNull().references(() => cv.id, { onDelete: "cascade" }),
  status: text("status").$type<ParseStatus>().notNull().default("queued"),
  jobId: uuid("job_id"),
  rawText: text("raw_text"),
  extractedData: jsonb("extracted_data").$type<ExtractedCV>(),
  parserVersion: text("parser_version").notNull().default("1"),
  model: text("model"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("cv_parse_cv_created_idx").on(t.cvId, t.createdAt),
  uniqueIndex("cv_parse_active_idx").on(t.cvId).where(sql`${t.status} IN ('queued', 'processing')`),
  check("cv_parse_status_check", sql`${t.status} IN ('queued', 'processing', 'completed', 'failed', 'needs_ocr')`),
]);

export const cvReview = pgTable("cv_review", {
  cvId: uuid("cv_id").primaryKey().references(() => cv.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<ExtractedCV>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Standing facts about the user (work eligibility, compensation, EEO choices).
// Per user, not per CV, so it survives uploading a new CV.
export const profile = pgTable("profile", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Profile>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Long-form answers the user approved when applying, reused as style examples
// and, for company-neutral questions, verbatim. Owned by the user; deletable.
export const answerMemory = pgTable("answer_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull(),
  question: text("question").notNull(),
  kind: text("kind").$type<"cover_letter" | "motivation" | "text">().notNull(),
  answer: text("answer").notNull(),
  company: text("company").notNull().default(""),
  jobTitle: text("job_title").notNull().default(""),
  sourceURL: text("source_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  uniqueIndex("answer_memory_user_question_job_idx").on(t.userId, t.questionKey, t.sourceURL),
  index("answer_memory_user_created_idx").on(t.userId, t.createdAt),
  check("answer_memory_kind_check", sql`${t.kind} IN ('cover_letter', 'motivation', 'text')`),
]);

// The row is both the immutable application snapshot and the durable queue.
export const submission = pgTable("submission", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sourceURL: text("source_url").notNull(),
  snapshot: jsonb("snapshot").$type<import("../submissions/types").SubmissionInput>().notNull(),
  status: text("status").$type<import("../submissions/types").SubmissionStatus>().notNull().default("queued"),
  message: text("message"),
  jobId: uuid("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index("submission_user_created_idx").on(t.userId, t.createdAt),
  uniqueIndex("submission_open_job_idx").on(t.userId, t.sourceURL).where(sql`${t.status} <> 'failed'`),
  check("submission_status_check", sql`${t.status} IN ('queued', 'processing', 'needs_input', 'submitting', 'submitted', 'failed', 'needs_verification')`),
]);

export const submissionFile = pgTable("submission_file", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").notNull().references(() => submission.id, { onDelete: "cascade" }),
  fieldId: text("field_id").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  content: bytea("content").notNull(),
}, t => [uniqueIndex("submission_file_field_idx").on(t.submissionId, t.fieldId)]);

// Ashby/Lever need a live browser to read a posting's questions (no public API
// exposes them). Greenhouse never uses this table: its fetch is instant HTTP.
export const jobImport = pgTable("job_import", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  ats: text("ats").$type<"ashby" | "lever">().notNull(),
  sourceURL: text("source_url").notNull(),
  status: text("status").$type<"queued" | "processing" | "completed" | "failed">().notNull().default("queued"),
  jobId: uuid("job_id"),
  result: jsonb("result").$type<import("../jobs/types").ImportedJob>(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, t => [
  index("job_import_user_created_idx").on(t.userId, t.createdAt),
  check("job_import_ats_check", sql`${t.ats} IN ('ashby', 'lever')`),
  check("job_import_status_check", sql`${t.status} IN ('queued', 'processing', 'completed', 'failed')`),
]);
