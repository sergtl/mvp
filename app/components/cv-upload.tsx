"use client";

import { CVParsing } from "./cv-review";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { CV_ACCEPT, MAX_CV_BYTES, type CVMetadata } from "@/lib/cv/config";

type UploadForm = { file: FileList };

async function responseJson(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "The request failed. Please try again.");
  }
  return response.json();
}

export function CVUploader({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["cvs", userId];
  const [notice, setNotice] = useState("");

  const form = useForm<UploadForm>();

  const cvs = useQuery<{ cvs: CVMetadata[] }>({
    queryKey,
    queryFn: async ({ signal }) =>
      responseJson(await fetch("/api/cvs", { signal })),
  });

  const upload = useMutation({
    mutationFn: async (file: File) =>
      responseJson(
        await fetch("/api/cvs", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        }),
      ),
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      form.reset();
      setNotice("Your CV was uploaded.");
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your CVs</CardTitle>
      </CardHeader>
      <CardContent className="gap-6">
        <form
          noValidate
          aria-busy={upload.isPending}
          onSubmit={form.handleSubmit(({ file }) => {
            setNotice("");
            upload.mutate(file[0]);
          })}
        >
          <fieldset disabled={upload.isPending} className="space-y-3">
            <Field>
              <FieldLabel htmlFor="cv-file">Upload a CV</FieldLabel>
              <input
                id="cv-file"
                type="file"
                accept={CV_ACCEPT}
                className="w-full min-w-0 rounded-md border p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1"
                aria-invalid={!!form.formState.errors.file}
                aria-describedby="cv-file-help cv-file-error"
                {...form.register("file", {
                  validate: (files) => {
                    const file = files?.[0];
                    if (!file) return "Choose a CV to upload.";
                    if (!file.size) return "The file is empty.";
                    if (file.size > MAX_CV_BYTES)
                      return "CVs must be 10 MB or smaller.";
                    if (!/\.(pdf|docx)$/i.test(file.name))
                      return "Choose a PDF or DOCX file.";
                    return true;
                  },
                  onChange: () => {
                    setNotice("");
                    upload.reset();
                  },
                })}
              />
              <p id="cv-file-help" className="text-sm text-muted-foreground">
                PDF or DOCX, up to 10 MB. PDF text is sent to OpenAI for extraction.
              </p>
              <FieldError
                id="cv-file-error"
                errors={[form.formState.errors.file]}
              />
            </Field>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload CV"}
            </Button>
          </fieldset>
          {upload.error && (
            <FieldError className="mt-3">{upload.error.message}</FieldError>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm">
              {notice}
            </p>
          )}
        </form>
        <div className="space-y-3">
          {cvs.isPending ? (
            <p role="status">Loading your CVs…</p>
          ) : cvs.isError ? (
            <div className="space-y-2">
              <FieldError>{cvs.error.message}</FieldError>
              <Button variant="outline" onClick={() => void cvs.refetch()}>
                Try again
              </Button>
            </div>
          ) : cvs.data.cvs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven’t uploaded a CV yet.
            </p>
          ) : (
            <ul className="divide-y">
              {cvs.data.cvs.map((cv) => (
                <li key={cv.id} className="space-y-1 py-3">
                  <a
                    href={`/api/cvs/${cv.id}`}
                    className="break-all font-medium underline underline-offset-4"
                  >
                    {cv.filename}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {Math.max(1, Math.ceil(cv.sizeBytes / 1024))} KB ·{" "}
                    {new Date(cv.createdAt).toLocaleDateString()}
                  </p>
                  {cv.contentType === "application/pdf" ? <CVParsing cvId={cv.id} userId={userId} /> : <p className="text-xs text-muted-foreground">Parsing is available for PDFs only.</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
