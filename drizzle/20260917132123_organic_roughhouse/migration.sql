CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"source_url" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message" text,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_status_check" CHECK ("status" IN ('queued', 'processing', 'needs_input', 'submitting', 'submitted', 'failed', 'needs_verification'))
);
--> statement-breakpoint
CREATE TABLE "submission_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"submission_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"content" bytea NOT NULL
);
--> statement-breakpoint
CREATE INDEX "submission_user_created_idx" ON "submission" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_open_job_idx" ON "submission" ("user_id","source_url") WHERE "status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "submission_file_field_idx" ON "submission_file" ("submission_id","field_id");--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "submission_file" ADD CONSTRAINT "submission_file_submission_id_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE CASCADE;