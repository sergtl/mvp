import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { countryName, isEU, scopeLabel } from "@/lib/geo/regions";
import { summarizeRoutes, type Profile } from "@/lib/profile/schema";
import { control } from "./constants";
import { CountrySelect } from "./country-select";
import { errorAt } from "./form-utils";
import { RouteField } from "./route-field";

export function EligibilitySection({ form }: { form: UseFormReturn<Profile> }) {
  const routes = useFieldArray({ control: form.control, name: "eligibility.routes" });
  const citizenships = useWatch({ control: form.control, name: "eligibility.citizenships" }) ?? [];
  const currentRoutes = useWatch({ control: form.control, name: "eligibility.routes" }) ?? [];
  const contractorRoute = currentRoutes.some((route) => route?.how?.includes("contractor"));

  // Suggested from citizenship; nothing is added until the user confirms.
  const suggestions = [
    ...new Set(citizenships.map((code) => (isEU(code) ? "EU" : code))),
  ].filter(
    (scope) => !currentRoutes.some((route) => route?.scope === scope && route.how?.includes("employee")),
  );

  const summary = summarizeRoutes(
    currentRoutes.flatMap((route) =>
      route?.scope && route.how?.length ? [{ scope: route.scope, how: route.how }] : [],
    ),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you live and where you can work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldDescription>
          Questions about where you can work are only answered from what you
          enter here. Anything left blank, or not covered by a route below, is
          left for you to answer.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="residence-country">Country of residence</FieldLabel>
          <Controller
            control={form.control}
            name="eligibility.residenceCountry"
            render={({ field }) => (
              <CountrySelect id="residence-country" value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
        <Controller
          control={form.control}
          name="eligibility.citizenships"
          render={({ field }) => (
            <div className="space-y-2 text-sm">
              <span>Citizenships</span>
              <div className="flex flex-wrap gap-2">
                {field.value.map((code) => (
                  <span key={code} className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
                    {countryName(code)}
                    <button
                      type="button"
                      aria-label={`Remove ${countryName(code)}`}
                      onClick={() => field.onChange(field.value.filter((c) => c !== code))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <CountrySelect
                value=""
                empty="Add a citizenship…"
                onChange={(code) =>
                  code && !field.value.includes(code) && field.onChange([...field.value, code])
                }
              />
            </div>
          )}
        />

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Where I can work, and how</h3>
          {routes.fields.map((entry, i) => (
            <RouteField
              key={entry.id}
              form={form}
              index={i}
              onRemove={() => routes.remove(i)}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => routes.append({ scope: "WORLDWIDE", how: ["contractor"] })}
            >
              Add worldwide B2B contractor
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => routes.append({ scope: "EU", how: ["employee"] })}
            >
              Add a route
            </Button>
            {suggestions.map((scope) => (
              <Button
                key={scope}
                type="button"
                variant="outline"
                onClick={() => routes.append({ scope, how: ["employee"] })}
              >
                Add {scopeLabel(scope)} as employee (from citizenship)
              </Button>
            ))}
          </div>
          <p role="status" className="text-sm text-muted-foreground">{summary}</p>
        </div>

        {contractorRoute && (
          <div className="space-y-2 rounded border p-3">
            <h3 className="text-sm font-medium">B2B contractor details</h3>
            <Field>
              <FieldLabel htmlFor="contractor-entity-country">Entity country</FieldLabel>
              <Controller
                control={form.control}
                name="eligibility.contractorEntity.country"
                render={({ field }) => (
                  <CountrySelect id="contractor-entity-country" value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-entity-type">
                Entity type (for example sole proprietor, LLC)
              </FieldLabel>
              <Input id="contractor-entity-type" {...form.register("eligibility.contractorEntity.type")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-entity-currency">Invoice currency</FieldLabel>
              <Input
                id="contractor-entity-currency"
                maxLength={3}
                placeholder="EUR"
                {...form.register("eligibility.contractorEntity.invoiceCurrency", {
                  setValueAs: (value: string) => value.toUpperCase(),
                })}
              />
              <FieldError
                errors={[errorAt(form.formState.errors, "eligibility.contractorEntity.invoiceCurrency")]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-note">
                Note for cover letters (one sentence, in your words)
              </FieldLabel>
              <Textarea
                id="contractor-note"
                rows={2}
                placeholder="I'm based in Georgia and work as an independent contractor through my own company."
                {...form.register("eligibility.contractorNote")}
              />
              <FieldError errors={[errorAt(form.formState.errors, "eligibility.contractorNote")]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contractor-mention">Mention it in cover letters</FieldLabel>
              <select
                id="contractor-mention"
                className={control}
                {...form.register("eligibility.mentionContractorNote")}
              >
                <option value="when_unclear">
                  Only when the posting doesn&apos;t say whether it takes contractors
                </option>
                <option value="always">Always</option>
                <option value="never">Never</option>
              </select>
            </Field>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
