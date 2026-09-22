import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/profile/schema";
import { errorAt } from "./form-utils";

export function ProjectField({
  form,
  index,
  onRemove,
}: {
  form: UseFormReturn<Profile>;
  index: number;
  onRemove: () => void;
}) {
  // Stable between server and client render, unlike useFieldArray's own
  // (randomly generated) field id, which must never be rendered into the DOM.
  const uid = useId();

  return (
    <FieldSet className="gap-2 rounded border p-3">
      <Field>
        <FieldLabel htmlFor={`${uid}-name`}>Name</FieldLabel>
        <Input id={`${uid}-name`} {...form.register(`projects.${index}.name`)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${uid}-url`}>Link</FieldLabel>
        <Input
          id={`${uid}-url`}
          placeholder="https://"
          {...form.register(`projects.${index}.url`)}
        />
        <FieldError errors={[errorAt(form.formState.errors, `projects.${index}.url`)]} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${uid}-summary`}>
          What it is and what you did (2–3 sentences)
        </FieldLabel>
        <Textarea id={`${uid}-summary`} rows={3} {...form.register(`projects.${index}.summary`)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor={`${uid}-role`}>Your role</FieldLabel>
          <Input id={`${uid}-role`} {...form.register(`projects.${index}.role`)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${uid}-tech`}>Tech</FieldLabel>
          <Input
            id={`${uid}-tech`}
            placeholder="TypeScript, Postgres"
            {...form.register(`projects.${index}.tech`)}
          />
        </Field>
      </div>
      <Button type="button" variant="link" onClick={onRemove}>
        Remove project
      </Button>
    </FieldSet>
  );
}
