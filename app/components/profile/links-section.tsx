import type { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/profile/schema";
import { errorAt } from "./form-utils";

const LINK_FIELDS = ["linkedin", "github", "portfolio"] as const;

export function LinksSection({ form }: { form: UseFormReturn<Profile> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldDescription>
          Optional. LinkedIn and GitHub links are otherwise taken from your CV
          when it has exactly one of each.
        </FieldDescription>
        {LINK_FIELDS.map((name) => (
          <Field key={name}>
            <FieldLabel htmlFor={`link-${name}`} className="capitalize">
              {name}
            </FieldLabel>
            <Input id={`link-${name}`} placeholder="https://" {...form.register(`links.${name}`)} />
            <FieldError errors={[errorAt(form.formState.errors, `links.${name}`)]} />
          </Field>
        ))}
      </CardContent>
    </Card>
  );
}
