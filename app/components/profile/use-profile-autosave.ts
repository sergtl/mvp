"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type Profile } from "@/lib/profile/schema";

export type SaveStatus =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "invalid"; problems: string[] }
  | { kind: "error"; message: string };

const AUTOSAVE_MS = 1000;
const headers = { "Content-Type": "application/json" };

// The form's own values in canonical form, or null while they are invalid.
const snapshotOf = (values: unknown) => {
  const parsed = profileSchema.safeParse(values);

  return parsed.success ? JSON.stringify(parsed.data) : null;
};

const words = (path: string) =>
  path
    .split(".")
    .filter((part) => !/^\d+$/.test(part))
    .slice(-2)
    .join(" › ")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase();

function problemsIn(errors: unknown, path = ""): string[] {
  if (!errors || typeof errors !== "object") return [];

  const node = errors as Record<string, unknown>;

  if (typeof node.message === "string")
    return [`${words(path)}: ${node.message}`];

  return Object.entries(node).flatMap(([key, value]) =>
    key === "ref" || key === "type"
      ? []
      : problemsIn(value, path ? `${path}.${key}` : key),
  );
}

async function saveProfile(response: Response) {
  const value = await response.json();

  if (!response.ok)
    throw new Error(value.error ?? "The request failed. Please try again.");

  return value;
}

// Saves as the user edits, so nothing depends on finding a Save button at the
// bottom of a long page. Also flushes a pending save when leaving the page.
export function useProfileAutosave(initial: Profile, initialSavedAt: string | null) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved" });
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const saveNowRef = useRef<() => void>(() => {});
  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let last = snapshotOf(initial);

    const run = async () => {
      if (busy) return;

      await form.handleSubmit(
        async (values) => {
          const snapshot = snapshotOf(values);

          if (snapshot === last) return setStatus({ kind: "saved" });

          busy = true;
          setStatus({ kind: "saving" });

          let failed = false;

          try {
            const saved = await saveProfile(
              await fetch("/api/profile", { method: "PUT", headers, body: JSON.stringify(values) }),
            );

            last = snapshot;
            setSavedAt(saved.updatedAt);
            setStatus({ kind: "saved" });
          } catch (error) {
            failed = true;
            setStatus({
              kind: "error",
              message: error instanceof Error ? error.message : "The request failed.",
            });
          } finally {
            busy = false;
          }

          // Edits made while this save was running still need saving.
          if (!failed && snapshotOf(form.getValues()) !== last) schedule();
        },
        (errors) => setStatus({ kind: "invalid", problems: problemsIn(errors) }),
      )();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), AUTOSAVE_MS);
    };

    saveNowRef.current = () => {
      clearTimeout(timer);
      void run();
    };

    const unsaved = () => busy || snapshotOf(form.getValues()) !== last;

    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        setStatus((current) => (current.kind === "saving" ? current : { kind: "unsaved" }));
        schedule();
      },
    });

    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved()) event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => {
      window.removeEventListener("beforeunload", warn);
      unsubscribe();
      clearTimeout(timer);

      // Navigating within the app: send pending valid edits before unmounting.
      const pending = snapshotOf(form.getValues());

      if (pending && pending !== last && !busy)
        void fetch("/api/profile", { method: "PUT", headers, body: pending, keepalive: true });
    };
  }, [form, initial]);

  return {
    form,
    status,
    savedAt,
    saveNow: () => saveNowRef.current(),
  };
}
