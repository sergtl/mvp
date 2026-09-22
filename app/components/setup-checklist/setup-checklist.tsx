"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setupSteps } from "@/lib/onboarding/steps";
import { StepItem } from "./step-item";
import { useSetupState } from "./use-setup-state";

// Shown until a user can apply: a parsed PDF CV and a profile with where they
// can work.
export function SetupChecklist({ userId }: { userId: string }) {
  const query = useSetupState(userId);

  if (!query.data) return null;

  const { steps, complete } = setupSteps(query.data);

  if (complete) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get ready to apply</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step) => (
            <StepItem key={step.id} step={step} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
