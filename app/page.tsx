"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { CVUploader } from "./components/cv-upload";
import { JobImporter } from "./components/job-import";
import { SignInForm } from "./components/sign-in";
import { SignUpForm } from "./components/sign-up";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";

export default function Home() {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession();
  const [isSignUp, setIsSignUp] = useState(false);
  const queryClient = useQueryClient();

  async function refreshSession() {
    await refetch();
  }

  const signOut = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error)
        throw new Error(result.error.message ?? "Unable to sign out.");
    },
    retry: false,
    onSuccess: async () => {
      // Do not retain the previous user's cached data after signing out.
      queryClient.clear();
      setIsSignUp(false);
      await refreshSession();
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className={session ? "w-full max-w-2xl" : "w-full max-w-sm"}>
        {isPending ? (
          <p role="status" className="text-center">
            Loading your account…
          </p>
        ) : sessionError ? (
          <div className="space-y-4">
            <p role="alert">Unable to load your session. Please try again.</p>
            <Button onClick={() => void refreshSession()}>Try again</Button>
          </div>
        ) : session ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Welcome, {session.user.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="break-words text-sm text-muted-foreground">
                  {session.user.email}
                </p>
                <Button
                  disabled={signOut.isPending}
                  onClick={() => signOut.mutate()}
                >
                  {signOut.isPending ? "Signing out…" : "Sign out"}
                </Button>
                {signOut.error && (
                  <FieldError>{signOut.error.message}</FieldError>
                )}
              </CardContent>
            </Card>

            <CVUploader key={session.user.id} userId={session.user.id} />
            <JobImporter key={`jobs-${session.user.id}`} userId={session.user.id} />
          </div>
        ) : isSignUp ? (
          <SignUpForm
            onSignIn={() => setIsSignUp(false)}
            onSuccess={refreshSession}
          />
        ) : (
          <SignInForm
            onSignUp={() => setIsSignUp(true)}
            onSuccess={refreshSession}
          />
        )}
      </div>
    </main>
  );
}
