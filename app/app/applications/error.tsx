"use client";

import { Button } from "@/components/ui/button";

export default function ApplicationsError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 p-4 md:p-8">
      <p role="alert">
        Unable to load this application data. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
