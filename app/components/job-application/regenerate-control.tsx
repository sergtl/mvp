"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Asks for a new draft of one answer, following an instruction.
export function RegenerateControl({
  disabled,
  pending,
  error,
  onRegenerate,
}: {
  disabled: boolean;
  pending: boolean;
  error?: string;
  onRegenerate: (instruction: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const instructionId = useId();

  if (!open)
    return (
      <Button type="button" variant="link" disabled={disabled} onClick={() => setOpen(true)}>
        Regenerate…
      </Button>
    );

  return (
    <div className="space-y-2">
      <Field>
        <FieldLabel htmlFor={instructionId}>How should it change?</FieldLabel>
        <Input
          id={instructionId}
          placeholder="e.g. shorter, lead with my side project, more direct"
          maxLength={500}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending || !instruction.trim()}
          onClick={() => onRegenerate(instruction.trim())}
        >
          {pending ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button type="button" variant="link" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
