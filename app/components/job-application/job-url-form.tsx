"use client";

import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function JobUrlForm({
  onSubmitUrl,
  pending,
}: {
  onSubmitUrl: (url: string) => void;
  pending: boolean;
}) {
  const form = useForm<{ url: string }>();

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(({ url }) => onSubmitUrl(url.trim()))}
    >
      <Field>
        <FieldLabel htmlFor="job-url">Job posting URL</FieldLabel>
        <Input
          id="job-url"
          type="url"
          placeholder="Link of a Greenhouse, Ashby or Lever job post"
          disabled={pending}
          {...form.register("url", {
            required: "Paste a job URL.",
            maxLength: { value: 2048, message: "The URL is too long." },
          })}
        />
        <FieldDescription>
          Works with Greenhouse, Ashby, and Lever postings.
        </FieldDescription>
        <FieldError errors={[form.formState.errors.url]} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Loading job…" : "Load job"}
      </Button>
    </form>
  );
}
