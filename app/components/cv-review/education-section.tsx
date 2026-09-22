import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { ExtractedCV } from "@/lib/cv/extraction-schema";
import { EducationRow } from "./education-row";

export function EducationSection({
  form,
  education,
}: {
  form: UseFormReturn<ExtractedCV>;
  education: UseFieldArrayReturn<ExtractedCV, "education">;
}) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend>Education</FieldLegend>
      {education.fields.map((entry, i) => (
        <EducationRow key={entry.id} form={form} index={i} onRemove={() => education.remove(i)} />
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          education.append({ institution: "", qualification: "", startDate: "", endDate: "" })
        }
      >
        Add education
      </Button>
    </FieldSet>
  );
}
