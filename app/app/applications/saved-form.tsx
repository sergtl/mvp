import type { JobField } from "@/lib/jobs/types";
import type { SubmissionInput } from "@/lib/submissions/types";

type SavedFile = { id: string; fieldId: string; filename: string };
const control =
  "w-full min-w-0 rounded-md border bg-muted/30 p-2 text-sm text-foreground disabled:opacity-100";

function SavedField({
  field,
  id,
  value,
}: {
  field: JobField;
  id: string;
  value: SubmissionInput["answers"][string] | undefined;
}) {
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  if (field.type === "consent")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input id={id} type="checkbox" checked={value === true} disabled /> I
        agree
      </label>
    );

  if (field.type === "multi_value_single_select")
    return (
      <select id={id} className={control} value={selected[0] ?? ""} disabled>
        <option value="">Not answered</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );

  if (field.type === "multi_value_multi_select")
    return (
      <div className="space-y-2">
        {field.options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              disabled
            />
            {option.label}
          </label>
        ))}
      </div>
    );

  const text =
    typeof value === "boolean" ? (value ? "Yes" : "No") : selected.join(", ");

  if (field.type === "textarea")
    return (
      <textarea
        id={id}
        className={control}
        value={text}
        rows={Math.min(20, Math.max(5, text.split("\n").length + 2))}
        placeholder="Not answered"
        disabled
      />
    );

  return (
    <input
      id={id}
      className={control}
      value={text}
      placeholder="Not answered"
      disabled
    />
  );
}

export function SavedApplicationForm({
  id,
  snapshot,
  files,
}: {
  id: string;
  snapshot: SubmissionInput;
  files: SavedFile[];
}) {
  return (
    <form className="space-y-6" aria-label="Saved application answers">
      {snapshot.job.sections.map((section, s) => (
        <section key={s} className="space-y-4">
          <h3 className="font-semibold">{section.title}</h3>

          {section.description && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {section.description}
            </p>
          )}
          {section.questions.map((question, q) => {
            if (question.fields.every((field) => field.type === "input_hidden"))
              return null;

            return (
              <fieldset
                key={q}
                disabled
                className="space-y-3 rounded-lg border p-4"
              >
                <legend className="px-1 text-sm font-medium">
                  {question.label}
                  {question.required ? " *" : ""}
                </legend>
                {question.description && (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {question.description}
                  </p>
                )}
                {question.fields.map((field, f) => {
                  if (field.type === "input_hidden") return null;
                  const fieldId = `${s}-${q}-${f}`;
                  const value = snapshot.answers[fieldId];
                  const selected = Array.isArray(value)
                    ? value
                    : typeof value === "string"
                      ? [value]
                      : [];
                  const file = files.find((item) => item.fieldId === fieldId);
                  return (
                    <div key={fieldId} className="space-y-2">
                      <label htmlFor={fieldId} className="block text-sm">
                        {question.fields.length > 1
                          ? field.type === "input_file"
                            ? "Attachment"
                            : "Text answer"
                          : question.label}
                      </label>
                      {field.type === "input_file" ? (
                        file ? (
                          <a
                            className="break-all text-sm underline underline-offset-4"
                            href={`/api/applications/${id}/files/${file.id}`}
                          >
                            {file.filename}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No attachment
                          </p>
                        )
                      ) : (
                        <SavedField field={field} id={fieldId} value={value} />
                      )}
                      {field.options
                        .filter(
                          (option) =>
                            option.freeForm && selected.includes(option.value),
                        )
                        .map((option) => (
                          <label
                            key={option.value}
                            className="block space-y-1 text-sm"
                          >
                            <span>{option.label} — please specify</span>
                            <input
                              className={control}
                              value={
                                snapshot.freeText[
                                  `${fieldId}:${option.value}`
                                ] ?? ""
                              }
                              disabled
                            />
                          </label>
                        ))}
                    </div>
                  );
                })}
              </fieldset>
            );
          })}
        </section>
      ))}
    </form>
  );
}
