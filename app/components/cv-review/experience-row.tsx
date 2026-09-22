import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";

const LABELS = {
  company: "Company",
  title: "Title",
  startDate: "Start date",
  endDate: "End date",
} as const;

export function ExperienceRow({
  form,
  index,
  onRemove,
}: {
  form: UseFormReturn<ExtractedCV>;
  index: number;
  onRemove: () => void;
}) {
  // Stable between server and client render, unlike useFieldArray's own
  // (randomly generated) field id, which must never be rendered into the DOM.
  const uid = useId();

  return (
    <FieldSet className="gap-2 rounded border p-3">
      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((name) => (
        <Field key={name}>
          <FieldLabel htmlFor={`${uid}-${name}`}>{LABELS[name]}</FieldLabel>
          <Input id={`${uid}-${name}`} {...form.register(`experience.${index}.${name}`)} />
        </Field>
      ))}
      <Field>
        <FieldLabel htmlFor={`${uid}-description`}>Description</FieldLabel>
        <Textarea
          id={`${uid}-description`}
          {...form.register(`experience.${index}.description`)}
        />
      </Field>
      <Button type="button" variant="link" onClick={onRemove}>
        Remove experience
      </Button>
    </FieldSet>
  );
}
