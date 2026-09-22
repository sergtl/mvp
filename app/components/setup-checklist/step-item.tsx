import Link from "next/link";
import type { SetupStep } from "@/lib/onboarding/steps";

const marks = {
  done: { symbol: "✓", label: "Done", tone: "text-green-600" },
  active: { symbol: "●", label: "Next", tone: "text-foreground" },
  problem: { symbol: "!", label: "Needs attention", tone: "text-destructive" },
  todo: { symbol: "○", label: "Later", tone: "text-muted-foreground" },
} as const;

export function StepItem({ step }: { step: SetupStep }) {
  const mark = marks[step.state];

  return (
    <li className="flex gap-3 text-sm">
      <span aria-label={mark.label} className={`w-4 shrink-0 text-center font-semibold ${mark.tone}`}>
        {mark.symbol}
      </span>
      <div className="space-y-0.5">
        <p className="font-medium">
          {step.href && step.state !== "done" ? (
            <Link href={step.href} className="underline">
              {step.title}
            </Link>
          ) : (
            step.title
          )}
        </p>
        <p className={step.state === "problem" ? "text-destructive" : "text-muted-foreground"}>
          {step.detail}
        </p>
      </div>
    </li>
  );
}
