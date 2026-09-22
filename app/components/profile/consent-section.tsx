import { useWatch, type UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEMOGRAPHIC_KEYS, demographicLabels, type Profile } from "@/lib/profile/schema";
import { control } from "./constants";

const CONSENT_FIELDS = [
  ["dataProcessing", "Employer data processing and retention consent"],
  ["demographicData", "Consent to process my demographic data"],
] as const;

export function ConsentSection({ form }: { form: UseFormReturn<Profile> }) {
  const demographics = useWatch({ control: form.control, name: "demographics" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equal opportunity and consent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldDescription>
          These are always yours to decide. By default you are asked on every
          application. Choose &quot;Decline to answer&quot; or a specific answer to have
          it filled in. A specific answer must match the form&apos;s wording,
          otherwise you will be asked.
        </FieldDescription>
        {DEMOGRAPHIC_KEYS.map((name) => (
          <div key={name} className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor={`demographic-${name}-mode`}>{demographicLabels[name]}</FieldLabel>
              <select
                id={`demographic-${name}-mode`}
                className={control}
                {...form.register(`demographics.${name}.mode`)}
              >
                <option value="ask">Ask me each time</option>
                <option value="decline">Decline to answer</option>
                <option value="answer">I will specify</option>
              </select>
            </Field>
            {demographics?.[name]?.mode === "answer" && (
              <Field>
                <FieldLabel htmlFor={`demographic-${name}-answer`}>Answer</FieldLabel>
                <Input
                  id={`demographic-${name}-answer`}
                  {...form.register(`demographics.${name}.answer`)}
                />
              </Field>
            )}
          </div>
        ))}
        {CONSENT_FIELDS.map(([name, label]) => (
          <Field key={name}>
            <FieldLabel htmlFor={`consent-${name}`}>{label}</FieldLabel>
            <select id={`consent-${name}`} className={control} {...form.register(`consents.${name}`)}>
              <option value="ask">Ask me each time</option>
              <option value="agree">Always agree</option>
            </select>
          </Field>
        ))}
      </CardContent>
    </Card>
  );
}
