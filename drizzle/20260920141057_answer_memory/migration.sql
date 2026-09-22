CREATE TABLE "answer_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"question_key" text NOT NULL,
	"question" text NOT NULL,
	"kind" text NOT NULL,
	"answer" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_memory_kind_check" CHECK ("kind" IN ('cover_letter', 'motivation', 'text'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "answer_memory_user_question_job_idx" ON "answer_memory" ("user_id","question_key","source_url");--> statement-breakpoint
CREATE INDEX "answer_memory_user_created_idx" ON "answer_memory" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "answer_memory" ADD CONSTRAINT "answer_memory_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;