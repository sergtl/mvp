import type { ExtractedCV, ParseStatus } from "../cv/extraction-schema";
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
