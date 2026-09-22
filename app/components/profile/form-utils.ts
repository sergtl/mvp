import { get, type FieldErrors } from "react-hook-form";

export const toNumber = (value: unknown) =>
  value === "" || value == null ? null : Number(value);

// A field's validation error, if any, by its dotted RHF path — pass directly
// into <FieldError errors={[errorAt(form.formState.errors, path)]}/>.
export const errorAt = (
  errors: FieldErrors,
  path: string,
): { message?: string } | undefined => get(errors, path);
