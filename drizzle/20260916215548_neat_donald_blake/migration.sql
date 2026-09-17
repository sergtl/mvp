CREATE TABLE "cv_parse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"cv_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"job_id" uuid,
	"raw_text" text,
	"extracted_data" jsonb,
	"parser_version" text DEFAULT '1' NOT NULL,
	"model" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "cv_parse_status_check" CHECK ("status" IN ('queued', 'processing', 'completed', 'failed', 'needs_ocr'))
);
--> statement-breakpoint
CREATE TABLE "cv_review" (
	"cv_id" uuid PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cv_parse_cv_created_idx" ON "cv_parse" ("cv_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_parse_active_idx" ON "cv_parse" ("cv_id") WHERE "status" IN ('queued', 'processing');--> statement-breakpoint
ALTER TABLE "cv_parse" ADD CONSTRAINT "cv_parse_cv_id_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cv"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cv_review" ADD CONSTRAINT "cv_review_cv_id_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cv"("id") ON DELETE CASCADE;