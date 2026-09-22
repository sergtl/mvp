"use client";

import { useEffect, useRef } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { JobField } from "@/lib/jobs/greenhouse";
import { supportedFieldTypes, type Answer } from "@/lib/jobs/answer-draft";

const control = "w-full min-w-0 rounded-md border bg-background p-2 text-sm";

// Renders the bare control for one field, no label: the caller already
// renders the question's label(s) above it.
export function ApplicationField({
  field,
  id,
  value,
  change,
  freeText,
  changeFreeText,
}: {
  field: JobField;
  id: string;
  value: Answer | undefined;
  change: (value: Answer) => void;
  freeText: Record<string, string>;
  changeFreeText: (key: string, value: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (field.type !== "input_file" || !fileInput.current) return;
    const files = new DataTransfer();
    if (value instanceof File) files.items.add(value);
    fileInput.current.files = files.files;
  }, [field.type, value]);

  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  if (field.type === "input_hidden")
    return <input type="hidden" name={field.name} value="" />;

  if (!supportedFieldTypes.has(field.type))
    return (
      <p className="text-sm text-amber-700">
        This field type ({field.type}) must be completed on the original
        posting.
      </p>
    );

  return (
    <div className="space-y-2">
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.name}
          rows={5}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        />
      ) : field.type === "input_file" ? (
        <input
          id={id}
          name={field.name}
          type="file"
          ref={fileInput}
          className={control}
          onChange={(e) => change(e.target.files?.[0] ?? null)}
        />
      ) : field.type === "consent" ? (
        <Field orientation="horizontal">
          <input
            id={id}
            name={field.name}
            type="checkbox"
            checked={value === true}
            onChange={(e) => change(e.target.checked)}
          />
          <FieldLabel htmlFor={id}>I agree</FieldLabel>
        </Field>
      ) : field.type === "multi_value_single_select" ? (
        <select
          id={id}
          name={field.name}
          className={control}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose an option</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "multi_value_multi_select" ? (
        <div id={id} className="space-y-2">
          {field.options.map((o) => {
            const optionId = `${id}-${o.value}`;

            return (
              <Field key={o.value} orientation="horizontal">
                <input
                  id={optionId}
                  type="checkbox"
                  name={field.name}
                  value={o.value}
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    change(
                      e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value),
                    )
                  }
                />
                <FieldLabel htmlFor={optionId} className="text-sm font-normal">
                  {o.label}
                </FieldLabel>
              </Field>
            );
          })}
        </div>
      ) : (
        <Input
          id={id}
          name={field.name}
          type={
            field.name === "email"
              ? "email"
              : field.name === "phone"
                ? "tel"
                : "text"
          }
          value={typeof value === "string" ? value : ""}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {field.options
        .filter((o) => o.freeForm && selected.includes(o.value))
        .map((o) => {
          const freeFormId = `${id}-freeform-${o.value}`;

          return (
            <Field key={o.value}>
              <FieldLabel htmlFor={freeFormId}>{o.label} — please specify</FieldLabel>
              <Input
                id={freeFormId}
                value={freeText[`${id}:${o.value}`] ?? ""}
                onChange={(e) => changeFreeText(`${id}:${o.value}`, e.target.value)}
              />
            </Field>
          );
        })}
    </div>
  );
}
