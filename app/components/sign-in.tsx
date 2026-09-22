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
import Link from "next/link";

const formSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Use no more than 128 characters."),
});

export function SignInForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const result = await authClient.signIn.email(data);
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
    },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    mutation.mutate(data);
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
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
                  name="email"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="email"
                        autoComplete="email"
                        aria-describedby={
                          fieldState.invalid ? "email-error" : undefined
                        }
                        type="email"
                        aria-invalid={fieldState.invalid}
                        placeholder="m@example.com"
                      />

                      {fieldState.invalid && (
                        <FieldError
                          id="email-error"
                          errors={[fieldState.error]}
                        />
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
                        autoComplete="current-password"
                        aria-describedby={
                          fieldState.invalid ? "password-error" : undefined
                        }
                        type="password"
                        aria-invalid={fieldState.invalid}
                        required
                      />

                      {fieldState.invalid && (
                        <FieldError
                          id="password-error"
                          errors={[fieldState.error]}
                        />
                      )}
                    </Field>
                  )}
                />

                <Field>
                  {mutation.error && (
                    <FieldError>{mutation.error.message}</FieldError>
                  )}
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Signing in…" : "Login"}
                  </Button>
                  <FieldDescription className="text-center">
                    Don&apos;t have an account?{" "}
                    <Link href="/register">Sign up</Link>
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
