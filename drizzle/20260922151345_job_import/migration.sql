CREATE TABLE "job_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"ats" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"job_id" uuid,
	"result" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "job_import_ats_check" CHECK ("ats" IN ('ashby', 'lever')),
	CONSTRAINT "job_import_status_check" CHECK ("status" IN ('queued', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "job_import_user_created_idx" ON "job_import" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "job_import" ADD CONSTRAINT "job_import_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;