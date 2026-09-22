import { useId } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { COUNTRIES, REGION_CODES, scopeLabel } from "@/lib/geo/regions";
import { ENGAGEMENTS, engagementLabels, type Profile } from "@/lib/profile/schema";
import { control } from "./constants";
import { errorAt } from "./form-utils";

// One "jobs in <scope> I can take as <how>" row.
export function RouteField({
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
  const scopeId = `${uid}-scope`;

  return (
    <FieldSet className="gap-2 rounded border p-3">
      <Field>
        <FieldLabel htmlFor={scopeId}>Jobs in</FieldLabel>
        <select
          id={scopeId}
          className={control}
          {...form.register(`eligibility.routes.${index}.scope`)}
        >
          <optgroup label="Regions">
            {REGION_CODES.map((code) => (
              <option key={code} value={code}>
                {scopeLabel(code)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Countries">
            {COUNTRIES.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Controller
        control={form.control}
        name={`eligibility.routes.${index}.how`}
        render={({ field }) => (
          <FieldSet>
            <FieldLegend variant="label">I can take them as</FieldLegend>
            {ENGAGEMENTS.map((how) => {
              const howId = `${uid}-${how}`;

              return (
                <Field key={how} orientation="horizontal">
                  <input
                    id={howId}
                    type="checkbox"
                    checked={field.value.includes(how)}
                    onChange={(event) =>
                      field.onChange(
                        event.target.checked
                          ? [...field.value, how]
                          : field.value.filter((h) => h !== how),
                      )
                    }
                  />
                  <FieldLabel htmlFor={howId} className="text-sm font-normal">
                    {engagementLabels[how]}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldSet>
        )}
      />
      <FieldError errors={[errorAt(form.formState.errors, `eligibility.routes.${index}.how`)]} />
      <Button type="button" variant="link" onClick={onRemove}>
        Remove
      </Button>
    </FieldSet>
  );
}
