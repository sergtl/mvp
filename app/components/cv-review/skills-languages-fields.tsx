import { Controller, type UseFormReturn } from "react-hook-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";

const NAMES = ["skills", "languages"] as const;

export function SkillsLanguagesFields({ form }: { form: UseFormReturn<ExtractedCV> }) {
  return (
    <>
      {NAMES.map((name) => (
        <Controller
          key={name}
          control={form.control}
          name={name}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`cv-${name}`} className="capitalize">
                {name} (one per line)
              </FieldLabel>
              <Textarea
                id={`cv-${name}`}
                value={field.value.join("\n")}
                onChange={(event) => field.onChange(event.target.value.split("\n"))}
              />
            </Field>
          )}
        />
      ))}
    </>
  );
}
