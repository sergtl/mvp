import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import type { Profile } from "@/lib/profile/schema";
import { ProjectField } from "./project-field";

export function ProjectsSection({ form }: { form: UseFormReturn<Profile> }) {
  const projects = useFieldArray({ control: form.control, name: "projects" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldDescription>
          Side projects and work you&apos;re proud of. Cover letters and
          &quot;why us&quot; answers may cite them, only as you describe them here.
        </FieldDescription>
        {projects.fields.map((entry, i) => (
          <ProjectField
            key={entry.id}
            form={form}
            index={i}
            onRemove={() => projects.remove(i)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={projects.fields.length >= 10}
          onClick={() => projects.append({ name: "", url: "", summary: "", tech: "", role: "" })}
        >
          Add a project
        </Button>
      </CardContent>
    </Card>
  );
}
