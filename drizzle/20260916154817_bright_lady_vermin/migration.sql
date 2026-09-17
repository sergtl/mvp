CREATE TABLE "cv" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "cv_file" (
	"cv_id" uuid PRIMARY KEY,
	"content" bytea NOT NULL
);
--> statement-breakpoint
-- Preserve the pre-existing users table; removing it is outside this migration.
CREATE INDEX "cv_user_created_idx" ON "cv" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "cv" ADD CONSTRAINT "cv_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cv_file" ADD CONSTRAINT "cv_file_cv_id_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cv"("id") ON DELETE CASCADE;