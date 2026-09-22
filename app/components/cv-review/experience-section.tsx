import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";
import { ExperienceRow } from "./experience-row";

export function ExperienceSection({
  form,
  experience,
}: {
  form: UseFormReturn<ExtractedCV>;
  experience: UseFieldArrayReturn<ExtractedCV, "experience">;
}) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend>Experience</FieldLegend>
      {experience.fields.map((entry, i) => (
        <ExperienceRow key={entry.id} form={form} index={i} onRemove={() => experience.remove(i)} />
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          experience.append({ company: "", title: "", startDate: "", endDate: "", description: "" })
        }
      >
        Add experience
      </Button>
    </FieldSet>
  );
}
