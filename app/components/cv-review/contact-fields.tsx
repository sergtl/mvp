import { Controller, type UseFormReturn } from "react-hook-form";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";

const CONTACT_FIELDS = ["name", "email", "phone", "location"] as const;

export function ContactFields({ form }: { form: UseFormReturn<ExtractedCV> }) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend>Contact details</FieldLegend>
      {CONTACT_FIELDS.map((name) => (
        <Field key={name}>
          <FieldLabel htmlFor={`contact-${name}`} className="capitalize">
            {name}
          </FieldLabel>
          <Input id={`contact-${name}`} {...form.register(`contact.${name}`)} />
        </Field>
      ))}
      <Controller
        control={form.control}
        name="contact.links"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="contact-links">Links (one per line)</FieldLabel>
            <Textarea
              id="contact-links"
              value={field.value.join("\n")}
              onChange={(event) => field.onChange(event.target.value.split("\n"))}
            />
          </Field>
        )}
      />
      <Field>
        <FieldLabel htmlFor="cv-summary">Summary</FieldLabel>
        <Textarea id="cv-summary" {...form.register("summary")} />
      </Field>
    </FieldSet>
  );
}
