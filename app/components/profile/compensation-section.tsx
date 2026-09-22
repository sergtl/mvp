import type { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/profile/schema";
import { control } from "./constants";
import { errorAt, toNumber } from "./form-utils";

const uppercase = (value: string) => value.toUpperCase();

export function CompensationSection({ form }: { form: UseFormReturn<Profile> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compensation and availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldSet className="gap-2 rounded border p-3">
          <FieldLegend variant="label">As an employee (per year)</FieldLegend>
          <div className="grid grid-cols-3 gap-2">
            <Field>
              <FieldLabel htmlFor="employee-min">Minimum</FieldLabel>
              <Input
                id="employee-min"
                type="number"
                min={0}
                {...form.register("compensation.employee.min", { setValueAs: toNumber })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-max">Maximum</FieldLabel>
              <Input
                id="employee-max"
                type="number"
                min={0}
                {...form.register("compensation.employee.max", { setValueAs: toNumber })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="employee-currency">Currency</FieldLabel>
              <Input
                id="employee-currency"
                maxLength={3}
                placeholder="USD"
                {...form.register("compensation.employee.currency", { setValueAs: uppercase })}
              />
            </Field>
          </div>
          <FieldError errors={[errorAt(form.formState.errors, "compensation.employee.currency")]} />
        </FieldSet>
        <FieldSet className="gap-2 rounded border p-3">
          <FieldLegend variant="label">As a B2B contractor</FieldLegend>
          <div className="grid grid-cols-3 gap-2">
            <Field>
              <FieldLabel htmlFor="contractor-rate">Rate</FieldLabel>
              <Input
                id="contractor-rate"
                type="number"
                min={0}
                {...form.register("compensation.contractor.amount", { setValueAs: toNumber })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-unit">Per</FieldLabel>
              <select id="contractor-unit" className={control} {...form.register("compensation.contractor.unit")}>
                {(["hour", "day", "month", "year"] as const).map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-currency">Currency</FieldLabel>
              <Input
                id="contractor-currency"
                maxLength={3}
                placeholder="EUR"
                {...form.register("compensation.contractor.currency", { setValueAs: uppercase })}
              />
            </Field>
          </div>
          <FieldError errors={[errorAt(form.formState.errors, "compensation.contractor.currency")]} />
        </FieldSet>
        <FieldDescription>
          A figure without a currency is never used. If both are set, an
          answer states both.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="start-date">Earliest start date or notice period</FieldLabel>
          <Input
            id="start-date"
            placeholder="Two weeks after an offer"
            {...form.register("availability.startDate")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="relocation">Willing to relocate</FieldLabel>
          <select id="relocation" className={control} {...form.register("relocation")}>
            <option value="ask">Ask me each time</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </CardContent>
    </Card>
  );
}
