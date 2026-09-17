"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportedJob, JobField } from "@/lib/jobs/greenhouse";
import type { AnswerResult } from "@/lib/jobs/answers";
import {
  applyGeneratedAnswers,
  attachResume,
  resumeFields,
  hasAnswer,
  type Answer,
  type SavedCVAttachment,
} from "@/lib/jobs/answer-draft";

const control = "w-full min-w-0 rounded-md border bg-background p-2 text-sm";

const supported = new Set([
  "input_text",
  "input_file",
  "input_hidden",
  "textarea",
  "multi_value_single_select",
  "multi_value_multi_select",
  "consent",
]);

function ApplicationField({
  field,
  id,
  value,
  change,
  freeText,
  changeFreeText,
}: {
  field: JobField;
  id: string;
  value: Answer | undefined;
  change: (value: Answer) => void;
  freeText: Record<string, string>;
  changeFreeText: (key: string, value: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (field.type !== "input_file" || !fileInput.current) return;
    const files = new DataTransfer();
    if (value instanceof File) files.items.add(value);
    fileInput.current.files = files.files;
  }, [field.type, value]);

  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  if (field.type === "input_hidden")
    return <input type="hidden" name={field.name} value="" />;

  if (!supported.has(field.type))
    return (
      <p className="text-sm text-amber-700">
        This field type ({field.type}) must be completed on the original
        posting.
      </p>
    );

  return (
    <div className="space-y-2">
      {field.type === "textarea" ? (
        <textarea
          id={id}
          name={field.name}
          rows={5}
          className={control}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        />
      ) : field.type === "input_file" ? (
        <input
          id={id}
          name={field.name}
          type="file"
          ref={fileInput}
          className={control}
          onChange={(e) => change(e.target.files?.[0] ?? null)}
        />
      ) : field.type === "consent" ? (
        <label className="flex items-center gap-2">
          <input
            id={id}
            name={field.name}
            type="checkbox"
            checked={value === true}
            onChange={(e) => change(e.target.checked)}
          />
          I agree
        </label>
      ) : field.type === "multi_value_single_select" ? (
        <select
          id={id}
          name={field.name}
          className={control}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose an option</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "multi_value_multi_select" ? (
        <div id={id} className="space-y-2">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={field.name}
                value={o.value}
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : (
        <input
          id={id}
          name={field.name}
          type={
            field.name === "email"
              ? "email"
              : field.name === "phone"
                ? "tel"
                : "text"
          }
          className={control}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {field.options
        .filter((o) => o.freeForm && selected.includes(o.value))
        .map((o) => (
          <label key={o.value} className="block space-y-1 text-sm">
            <span>{o.label} — please specify</span>
            <input
              className={control}
              value={freeText[`${id}:${o.value}`] ?? ""}
              onChange={(e) =>
                changeFreeText(`${id}:${o.value}`, e.target.value)
              }
            />
          </label>
        ))}
    </div>
  );
}

function JobApplication({ job, userId }: { job: ImportedJob; userId: string }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [cvId, setCvId] = useState("");
  const [generationNotes, setGenerationNotes] = useState<
    Record<string, string>
  >({});
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<
    Record<string, SavedCVAttachment>
  >({});

  const cvs = useQuery<{ cvs: { id: string; filename: string }[] }>({
    queryKey: ["answer-cvs", userId],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/jobs/answers", { signal });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load parsed CVs.");
      return data;
    },
  });

  const selectedCV = cvId || cvs.data?.cvs[0]?.id || "";

  async function downloadSelectedCV() {
    const cv = cvs.data?.cvs.find((item) => item.id === selectedCV);

    if (!cv) throw new Error("Choose a parsed CV first.");

    const response = await fetch(`/api/cvs/${cv.id}`);

    if (!response.ok)
      throw new Error(
        "Unable to attach your CV. Refresh your CVs and try again.",
      );

    const blob = await response.blob();

    if (blob.type !== "application/pdf" || !blob.size)
      throw new Error("The selected CV must be a PDF.");

    return {
      cvId: cv.id,
      file: new File([blob], cv.filename, { type: "application/pdf" }),
    };
  }

  const attach = useMutation({
    mutationFn: downloadSelectedCV,
    retry: false,
    gcTime: 0,
    onSuccess: ({ cvId, file }) => {
      const attached = attachResume(
        job,
        answers,
        attachments,
        cvId,
        file,
        true,
      );
      setAnswers(attached.answers);
      setAttachments(attached.attachments);
      setGenerationNotes((notes) =>
        Object.fromEntries(
          Object.entries(notes).filter(
            ([key]) =>
              !resumeFields(job).some((field) => field.questionKey === key),
          ),
        ),
      );
      setErrors({});
      setNotice(
        `Attached ${file.name}. This original PDF will be used for the application.`,
      );
    },
  });

  const generate = useMutation<
    AnswerResult & { attachedCV?: { cvId: string; file: File } },
    Error
  >({
    mutationFn: async () => {
      let attachedCV: { cvId: string; file: File } | undefined;
      // Attach independently of the AI request so an AI failure does not lose the PDF.
      if (resumeFields(job).some((field) => !hasAnswer(answers[field.id]))) {
        const { cvId, file } = await downloadSelectedCV();

        attachedCV = { cvId, file };

        const attached = attachResume(job, answers, attachments, cvId, file);

        setAnswers(attached.answers);
        setAttachments(attached.attachments);
      }

      const response = await fetch("/api/jobs/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvId: selectedCV, job }),
      });

      const data = await response.json();

      if (!response.ok)
        throw new Error(data.error ?? "Unable to generate answers.");

      return { ...data, attachedCV };
    },
    retry: false,
    gcTime: 0,
    onSuccess: (result) => {
      const base = result.attachedCV
        ? attachResume(
            job,
            answers,
            attachments,
            result.attachedCV.cvId,
            result.attachedCV.file,
          ).answers
        : answers;

      const applied = applyGeneratedAnswers(base, fileDrafts, result);

      setAnswers(applied.answers);
      setFileDrafts(applied.fileDrafts);
      setGenerationNotes(applied.notes);
      setErrors({});
      setNotice(
        `Filled ${applied.count} answers. Review the drafts and complete any questions marked for your input.`,
      );
    },
  });
  const clearNotice = () => {
    setNotice("");
    setErrors({});
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">{job.title}</h2>
        <p className="text-sm text-muted-foreground">
          {[job.company, job.location].filter(Boolean).join(" · ")}
        </p>
        <a
          href={job.sourceURL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          View original posting
        </a>
      </header>
      <details open>
        <summary className="cursor-pointer font-medium">
          Job description
        </summary>
        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {job.description}
        </div>
      </details>
      <div className="space-y-3 rounded-md border p-4">
        <label htmlFor="answer-cv" className="block text-sm font-medium">
          CV to use for answers
        </label>
        <select
          id="answer-cv"
          className={control}
          value={selectedCV}
          disabled={
            generate.isPending || attach.isPending || !cvs.data?.cvs.length
          }
          onChange={(event) => {
            setCvId(event.target.value);
            generate.reset();
            attach.reset();
          }}
        >
          {!cvs.data?.cvs.length && (
            <option value="">
              {cvs.isPending ? "Loading CVs…" : "No parsed CVs yet"}
            </option>
          )}
          {cvs.data?.cvs.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.filename}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={cvs.isFetching || generate.isPending || attach.isPending}
          onClick={() => void cvs.refetch()}
        >
          Refresh CVs
        </Button>
        {resumeFields(job).length > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={generate.isPending || attach.isPending || !selectedCV}
            onClick={() => {
              clearNotice();
              attach.mutate();
            }}
          >
            {attach.isPending ? "Attaching PDF…" : "Attach selected CV PDF"}
          </Button>
        )}
        {attach.error && (
          <p role="alert" className="text-sm text-destructive">
            {attach.error.message}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Generate answers also attaches your original PDF to an empty resume
          upload. Use Attach selected CV PDF to replace an existing attachment.
        </p>
        <p className="text-sm text-muted-foreground">
          Uses your saved CV corrections. Fills empty required answers, cover
          letters, motivation questions, and LinkedIn and GitHub links—even when
          optional. Review drafts before using them.
        </p>
        {!cvs.isPending && !cvs.data?.cvs.length && (
          <p className="text-sm">
            Upload and parse a CV above to generate answers.
          </p>
        )}
        {cvs.error && (
          <p role="alert" className="text-sm text-destructive">
            {cvs.error.message}
          </p>
        )}
        <Button
          type="button"
          disabled={
            generate.isPending ||
            attach.isPending ||
            !cvs.data?.cvs.some((cv) => cv.id === selectedCV)
          }
          onClick={() => {
            clearNotice();
            generate.mutate();
          }}
        >
          {generate.isPending ? "Generating answers…" : "Generate answers"}
        </Button>
        {generate.isPending && (
          <p role="status" className="text-sm">
            Reading your CV and drafting answers for this role…
          </p>
        )}
        {generate.error && (
          <p role="alert" className="text-sm text-destructive">
            {generate.error.message}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          const nextErrors: Record<string, string> = {};
          job.sections.forEach((section, s) =>
            section.questions.forEach((question, q) => {
              const key = `${s}-${q}`;
              const visible = question.fields
                .map((field, f) => ({ field, id: `${key}-${f}` }))
                .filter(({ field }) => field.type !== "input_hidden");
              if (
                question.required &&
                visible.length &&
                !visible.some(({ id }) => hasAnswer(answers[id]))
              )
                nextErrors[key] =
                  "Answer this question using at least one of its inputs.";
              for (const { field, id } of visible) {
                if (!supported.has(field.type))
                  nextErrors[key] =
                    "This question includes a field that must be completed on Greenhouse.";
                const value = answers[id];
                const selected = Array.isArray(value)
                  ? value
                  : typeof value === "string"
                    ? [value]
                    : [];
                if (
                  selected.length === 1 &&
                  field.options.some(
                    (o) => o.value === selected[0] && o.freeForm,
                  ) &&
                  !freeText[`${id}:${selected[0]}`]?.trim()
                )
                  nextErrors[key] = "Please specify your selected answer.";
              }
            }),
          );
          setErrors(nextErrors);
          setNotice(
            Object.keys(nextErrors).length
              ? "Please review the highlighted questions."
              : "All visible required questions are filled. Your answers are kept on this page only.",
          );
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">Application fields</h2>
          <p className="text-sm text-muted-foreground">
            Required questions are marked *. Answers and selected files stay on
            this page and are cleared when you leave or load another job.
          </p>
        </div>

        {job.sections.map((section, s) => (
          <section key={s} className="space-y-4">
            <h3 className="font-semibold">{section.title}</h3>
            {section.description && (
              <p className="whitespace-pre-wrap text-sm">
                {section.description}
              </p>
            )}
            {section.questions.map((question, q) => {
              const key = `${s}-${q}`;
              if (question.fields.every((f) => f.type === "input_hidden"))
                return (
                  <div key={key} hidden>
                    {question.fields.map((f, i) => (
                      <input key={i} type="hidden" name={f.name} value="" />
                    ))}
                  </div>
                );
              return (
                <fieldset
                  key={key}
                  disabled={generate.isPending || attach.isPending}
                  className="space-y-2 rounded-md border p-3"
                  aria-describedby={errors[key] ? `error-${key}` : undefined}
                >
                  <legend className="px-1 text-sm font-medium">
                    {question.label}
                    {question.required ? " *" : " (optional)"}
                  </legend>
                  {question.description && (
                    <p className="whitespace-pre-wrap text-sm">
                      {question.description}
                    </p>
                  )}
                  {question.fields.filter((f) => f.type !== "input_hidden")
                    .length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Choose one way to answer this question.
                    </p>
                  )}
                  {question.fields.map((field, f) => {
                    const id = `${key}-${f}`;
                    return (
                      <div key={id}>
                        {field.type !== "input_hidden" && (
                          <label htmlFor={id} className="mb-1 block text-sm">
                            {question.fields.length > 1
                              ? field.type === "input_file"
                                ? "Upload a file"
                                : field.type === "textarea"
                                  ? "Enter text"
                                  : question.label
                              : question.label}
                          </label>
                        )}
                        <ApplicationField
                          field={field}
                          id={id}
                          value={answers[id]}
                          change={(value) => {
                            clearNotice();
                            setAttachments((current) => {
                              const next = { ...current };
                              delete next[id];
                              return next;
                            });
                            setGenerationNotes((notes) => {
                              const next = { ...notes };
                              delete next[key];
                              return next;
                            });
                            setFileDrafts((drafts) => {
                              const next = { ...drafts };
                              delete next[id];
                              return next;
                            });
                            setAnswers((a) => ({ ...a, [id]: value }));
                          }}
                          freeText={freeText}
                          changeFreeText={(key, value) => {
                            clearNotice();
                            setFreeText((t) => ({ ...t, [key]: value }));
                          }}
                        />
                        {attachments[id] && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Attached original CV:{" "}
                            <a
                              className="underline"
                              href={`/api/cvs/${attachments[id].cvId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {attachments[id].filename}
                            </a>
                          </p>
                        )}
                        {fileDrafts[id] !== undefined && (
                          <div className="mt-2 space-y-2">
                            <label htmlFor={`draft-${id}`} className="text-sm">
                              Generated cover letter (cover-letter.txt)
                            </label>
                            <textarea
                              id={`draft-${id}`}
                              className={control}
                              rows={10}
                              value={fileDrafts[id]}
                              onChange={(event) => {
                                const text = event.target.value;
                                setFileDrafts((drafts) => ({
                                  ...drafts,
                                  [id]: text,
                                }));
                                setAnswers((a) => ({
                                  ...a,
                                  [id]: text.trim()
                                    ? new File([text], "cover-letter.txt", {
                                        type: "text/plain",
                                      })
                                    : null,
                                }));
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Draft prepared as a text file. Choose a different
                              file above to replace it.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {errors[key] && (
                    <p
                      id={`error-${key}`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors[key]}
                    </p>
                  )}
                  {generationNotes[key] && (
                    <p className="text-sm text-amber-700">
                      {generationNotes[key]}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </section>
        ))}
        <Button type="submit" variant="outline">
          Check required fields
        </Button>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </form>
    </div>
  );
}

export function JobImporter({ userId }: { userId: string }) {
  const form = useForm<{ url: string }>();

  const job = useMutation<ImportedJob, Error, string>({
    mutationFn: async (url) => {
      const response = await fetch(
        `/api/jobs/greenhouse?${new URLSearchParams({ url })}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load this job.");
      return data;
    },
    retry: false,
    gcTime: 0,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job application</CardTitle>
      </CardHeader>
      <CardContent className="gap-6">
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(({ url }) => job.mutate(url.trim()))}
        >
          <label htmlFor="job-url" className="block text-sm font-medium">
            Greenhouse job URL
          </label>
          <input
            id="job-url"
            type="url"
            placeholder="https://job-boards.greenhouse.io/company/jobs/123456"
            className={control}
            disabled={job.isPending}
            {...form.register("url", {
              required: "Paste a job URL.",
              maxLength: { value: 2048, message: "The URL is too long." },
            })}
          />
          {form.formState.errors.url && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.url.message}
            </p>
          )}
          <Button type="submit" disabled={job.isPending}>
            {job.isPending ? "Loading job…" : "Load job"}
          </Button>
        </form>
        {job.isPending && (
          <p role="status" className="text-sm">
            Loading the description and application questions…
          </p>
        )}
        {job.error && (
          <p role="alert" className="text-sm text-destructive">
            {job.error.message}
          </p>
        )}
        {job.isSuccess && (
          <JobApplication
            key={`${job.data.sourceURL}:${job.submittedAt}`}
            job={job.data}
            userId={userId}
          />
        )}
      </CardContent>
    </Card>
  );
}
