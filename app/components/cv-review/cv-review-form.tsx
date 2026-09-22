"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSet } from "@/components/ui/field";
import { extractedCVSchema, type ExtractedCV } from "@/lib/cv/extraction-schema";
import { ContactFields } from "./contact-fields";
import { EducationSection } from "./education-section";
import { ExperienceSection } from "./experience-section";
import { RawTextDetails } from "./raw-text-details";
import { SkillsLanguagesFields } from "./skills-languages-fields";
import { useSaveReview } from "./use-save-review";

export function CVReviewForm({
  cvId,
  initial,
  rawText,
  onSaved,
}: {
  cvId: string;
  initial: ExtractedCV;
  rawText: string;
  onSaved: () => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);
  const form = useForm<ExtractedCV>({
    resolver: zodResolver(extractedCVSchema),
    defaultValues: initial,
  });
  const experience = useFieldArray({ control: form.control, name: "experience" });
  const education = useFieldArray({ control: form.control, name: "education" });
  const saveReview = useSaveReview(cvId);

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      noValidate
      onChange={() => setSaved(false)}
      onSubmit={form.handleSubmit((values) =>
        saveReview.mutate(values, {
          onSuccess: async () => {
            form.reset(values);
            setSaved(true);
            await onSaved();
          },
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">
        Review the extracted details and correct anything missing or inaccurate.
      </p>

      <FieldSet disabled={saveReview.isPending} className="gap-4">
        <ContactFields form={form} />
        <ExperienceSection form={form} experience={experience} />
        <EducationSection form={form} education={education} />
        <SkillsLanguagesFields form={form} />

        {Object.keys(form.formState.errors).length > 0 && (
          <FieldError>
            One or more fields are too long, or there are too many entries.
            Shorten the review and try again.
          </FieldError>
        )}

        <Button type="submit" disabled={saveReview.isPending}>
          {saveReview.isPending ? "Saving…" : "Save reviewed CV"}
        </Button>
      </FieldSet>

      {saveReview.error && <FieldError>{saveReview.error.message}</FieldError>}

      {saved && (
        <p role="status" className="text-sm">
          Your corrections were saved.
        </p>
      )}

      <RawTextDetails rawText={rawText} />
    </form>
  );
}
