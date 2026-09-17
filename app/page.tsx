"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { CVUploader } from "./components/cv-upload";
import { JobImporter } from "./components/job-import";
import { SignUpForm } from "./components/sign-up";
import { SignInForm } from "./components/sign-in";
import { cn } from "cn";

export default function Home() {
  const [isSignUp, setIsSignUp] = useState(false);
  const { data: session, isPending, refetch } = authClient.useSession();

  async function refreshSession() {
    await refetch();
  }

  return (
    <main
      className={cn(
        "flex flex-1 px-8 py-8",
        !session && "items-center justify-center",
      )}
    >
      <div className="w-full max-w-2xl">
        {isPending && (
          <p role="status" className="text-center">
            Loading your account…
          </p>
        )}

        {!isPending && session?.user && (
          <div className="space-y-6">
            <CVUploader key={session.user.id} userId={session.user.id} />
            <JobImporter
              key={`jobs-${session.user.id}`}
              userId={session.user.id}
            />
          </div>
        )}

        {!isPending && !session?.user && isSignUp && (
          <SignUpForm
            onSignIn={() => setIsSignUp(false)}
            onSuccess={refreshSession}
          />
        )}

        {!isPending && !session?.user && !isSignUp && (
          <SignInForm
            onSignUp={() => setIsSignUp(true)}
            onSuccess={refreshSession}
          />
        )}
      </div>
    </main>
  );
}
