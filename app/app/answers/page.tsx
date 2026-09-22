import { DeleteAnswerButton } from "@/app/components/delete-answer";
import { loadMemory } from "@/lib/answers/memory";
import { requireSession } from "@/lib/require-session";

const kindLabels = {
  cover_letter: "Cover letter",
  motivation: "Motivation",
  text: "Answer",
} as const;

export default async function AnswersPage() {
  const session = await requireSession();

  const answers = await loadMemory(session.user.id);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Saved answers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Long answers you approved when applying. They&apos;re used to draft
          future answers in your voice, and to reuse company-neutral answers.
          Delete any you don&apos;t want kept.
        </p>
      </div>
      {answers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Answers appear here after you apply to a job.
        </p>
      )}
      <ul className="space-y-4">
        {answers.map((entry) => (
          <li key={entry.id} className="space-y-2 rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{entry.question}</p>
                <p className="text-xs text-muted-foreground">
                  {kindLabels[entry.kind]} ·{" "}
                  {[entry.jobTitle, entry.company].filter(Boolean).join(" at ") || "Unknown job"}
                </p>
              </div>
              <DeleteAnswerButton id={entry.id} />
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{entry.answer}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
