"use client";

import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Use no more than 128 characters."),
});

export function SignUpForm({
  className,
  onSignIn,
  onSuccess,
  ...props
}: React.ComponentProps<"div"> & {
  onSignIn: () => void;
  onSuccess: () => Promise<void>;
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const result = await authClient.signUp.email(data);
      if (result.error) {
        throw new Error(
          result.error.message ?? "Unable to authenticate. Please try again.",
        );
      }
    },
    retry: false,
    gcTime: 0,
    onSuccess: async () => {
      form.reset();
      await onSuccess();
    },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    mutation.mutate(data);
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Enter your details below to create an account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            aria-busy={mutation.isPending}
          >
            <fieldset disabled={mutation.isPending}>
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="name">Name</FieldLabel>
                      <Input
                        {...field}
                        id="name"
                        autoComplete="name"
                        aria-describedby={fieldState.invalid ? "name-error" : undefined}
                        aria-invalid={fieldState.invalid}
                        placeholder="John Doe"
                      />
  
                      {fieldState.invalid && (
                        <FieldError id="name-error" errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
  
                <Controller
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="email"
                        autoComplete="email"
                        aria-describedby={fieldState.invalid ? "email-error" : undefined}
                        type="email"
                        aria-invalid={fieldState.invalid}
                        placeholder="m@example.com"
                      />
  
                      {fieldState.invalid && (
                        <FieldError id="email-error" errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
  
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <div className="flex items-center">
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                      </div>
                      <Input
                        {...field}
                        id="password"
                        autoComplete="new-password"
                        aria-describedby={fieldState.invalid ? "password-error" : undefined}
                        type="password"
                        aria-invalid={fieldState.invalid}
                        required
                      />
  
                      {fieldState.invalid && (
                        <FieldError id="password-error" errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
  
                <Field>
                  {mutation.error && <FieldError>{mutation.error.message}</FieldError>}
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Creating account…" : "Sign up"}
                  </Button>
                  <FieldDescription className="text-center">
                    Already have an account? <Button type="button" variant="link" disabled={mutation.isPending} onClick={onSignIn}>Sign in</Button>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
