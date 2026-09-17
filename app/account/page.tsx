"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function AccountPage() {
  const { data: session, refetch } = authClient.useSession();
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
      await refreshSession();
    },
  });

  if (!session?.user) {
    return null;
  }

  return (
    <main className="flex flex-1 px-8 py-8">
      <div className="w-full max-w-2xl">
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
            {signOut.error && <FieldError>{signOut.error.message}</FieldError>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
