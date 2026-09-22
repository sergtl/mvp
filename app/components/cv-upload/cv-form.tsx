import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldSet } from "@/components/ui/field";
import { CV_ACCEPT, MAX_CV_BYTES } from "@/lib/cv/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

type UploadForm = { file: FileList };

export function CVForm({ userId }: { userId: string }) {
  const [notice, setNotice] = useState("");

  const queryClient = useQueryClient();
  const queryKey = ["cvs", userId];

  const form = useForm<UploadForm>();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch("/api/cvs", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The request failed. Please try again.");
      }
      return response.json();
    },
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      form.reset();

      setNotice("Your CV was uploaded.");

      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["setup", userId] });
    },
  });

  return (
    <form
      noValidate
      aria-busy={upload.isPending}
      onSubmit={form.handleSubmit(({ file }) => {
        setNotice("");
        upload.mutate(file[0]);
      })}
    >
      <FieldSet disabled={upload.isPending} className="gap-3">
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
            PDF or DOCX, up to 10 MB.
          </p>
          <FieldError
            id="cv-file-error"
            errors={[form.formState.errors.file]}
          />
        </Field>
        <Button type="submit">
          {upload.isPending ? "Uploading…" : "Upload CV"}
        </Button>
      </FieldSet>

      {upload.error && (
        <FieldError className="mt-3">{upload.error.message}</FieldError>
      )}

      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </form>
  );
}
