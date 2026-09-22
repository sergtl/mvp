import { parseErrors, type ParseStatus } from "../cv/extraction-schema";

export type SetupState = {
  cv: { id: string; filename: string; isPdf: boolean } | null;
  parse: { status: ParseStatus; errorCode: string | null; stuck: boolean } | null;
  reviewed: boolean;
  profile: { saved: boolean; complete: boolean };
};

export type SetupStep = {
  id: "cv" | "parse" | "review" | "profile";
  title: string;
  state: "done" | "active" | "todo" | "problem";
  detail: string;
  href?: string;
};

// The review step is recommended but optional, so it never blocks completion.
export function setupSteps({ cv, parse, reviewed, profile }: SetupState) {
  const parseDone = parse?.status === "completed";

  const steps: SetupStep[] = [
    {
      id: "cv",
      title: "Upload your CV",
      ...(!cv
        ? { state: "active", detail: "Upload a PDF. Answers are drafted from it." }
        : cv.isPdf
          ? { state: "done", detail: cv.filename }
          : {
              state: "problem",
              detail: `${cv.filename} can't be read yet. Upload a PDF version.`,
            }),
    },
    {
      id: "parse",
      title: "We read your CV",
      ...(!cv?.isPdf
        ? { state: "todo", detail: "Starts after you upload a PDF." }
        : !parse || parse.status === "queued"
          ? parse?.stuck
            ? {
                state: "problem",
                detail:
                  "Reading hasn't started. The CV worker isn't running: start it with pnpm worker.",
              }
            : { state: "active", detail: "Waiting to start…" }
          : parse.status === "processing"
            ? { state: "active", detail: "Reading your CV…" }
            : parseDone
              ? { state: "done", detail: "Your details were extracted." }
              : {
                  state: "problem",
                  detail: `${parseErrors[parse.errorCode ?? ""] ?? "Reading failed."} Use Retry parsing below.`,
                }),
    },
    {
      id: "review",
      title: "Check the extracted details",
      ...(reviewed
        ? { state: "done", detail: "Reviewed." }
        : parseDone
          ? {
              state: "active",
              detail: "Optional but worth a minute: open Review extracted CV below and fix anything wrong.",
            }
          : { state: "todo", detail: "Available once your CV is read." }),
    },
    {
      id: "profile",
      title: "Tell us where you can work",
      href: "/app/profile",
      ...(profile.complete
        ? { state: "done", detail: "Your profile is set up." }
        : {
            state: cv?.isPdf && parseDone ? "active" : "todo",
            detail: profile.saved
              ? "Add your country of residence and where you can work."
              : "Work eligibility, pay and EEO choices. Filled in on every application so you don't retype them.",
          }),
    },
  ];

  return {
    steps,
    // Everything an application needs. Reviewing the CV is optional.
    complete: steps.every((step) => step.id === "review" || step.state === "done"),
  };
}
