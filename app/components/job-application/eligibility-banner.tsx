import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import type { EligibilityResponse } from "./use-eligibility";

const verdicts = {
  eligible: { title: "You look eligible for this role", tone: "border-green-600/40" },
  unclear: { title: "Check this before applying", tone: "border-amber-600/50" },
  blocked: { title: "This role may not be open to you", tone: "border-destructive/60" },
} as const;

export function EligibilityBanner({ query }: { query: UseQueryResult<EligibilityResponse> }) {
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking whether this role is open to you…
      </p>
    );

  if (query.isError)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Couldn&apos;t check eligibility ({query.error.message}). You can still apply.
      </p>
    );

  const { eligibility, hasProfile } = query.data;
  const verdict = verdicts[eligibility.verdict];

  return (
    <section
      aria-label="Eligibility"
      className={`space-y-2 rounded-md border p-4 text-sm ${verdict.tone}`}
    >
      <h3 className="font-medium">{verdict.title}</h3>
      <ul className="space-y-2">
        {eligibility.findings.map((finding) => (
          <li key={finding.text}>
            <p>{finding.text}</p>
            {finding.quote && (
              <blockquote className="mt-1 border-l-2 pl-3 text-xs italic text-muted-foreground">
                “{finding.quote}”
              </blockquote>
            )}
          </li>
        ))}
      </ul>
      {(!hasProfile || eligibility.findings.some((f) => f.level === "unclear")) && (
        <Link href="/app/profile" className="inline-block underline">
          {hasProfile ? "Review your profile" : "Set up your profile"}
        </Link>
      )}
    </section>
  );
}
