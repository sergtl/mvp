import { Button } from "@/components/ui/button";
import type { SaveStatus } from "./use-profile-autosave";

export function SaveStatusBar({
  status,
  savedAt,
}: {
  status: SaveStatus;
  savedAt: string | null;
}) {
  // The time is formatted in the browser's locale, so it may differ from the server's.
  const saved = savedAt ? (
    <>
      Saved{" "}
      <time dateTime={savedAt} suppressHydrationWarning>
        {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
    </>
  ) : (
    "Nothing saved yet"
  );

  return (
    <div className="sticky top-0 z-10 -mx-4 space-y-1 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm" data-testid="save-status">
          {status.kind === "saved" && <>{saved}. Changes save automatically.</>}
          {status.kind === "unsaved" && "Unsaved changes…"}
          {status.kind === "saving" && "Saving…"}
          {status.kind === "invalid" && (
            <span className="text-destructive">Not saved. Fix the fields below.</span>
          )}
          {status.kind === "error" && (
            <span className="text-destructive">Not saved: {status.message}</span>
          )}
        </p>
        <Button type="submit" size="sm" disabled={status.kind === "saving"}>
          {status.kind === "error" ? "Try again" : "Save now"}
        </Button>
      </div>
      {status.kind === "invalid" && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {status.problems.slice(0, 5).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
