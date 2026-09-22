"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { CVReviewForm } from "./cv-review-form";
import { ParsingStatus } from "./parsing-status";
import { cvParseKey, useCvParse } from "./use-cv-parse";
import { useRetryParse } from "./use-retry-parse";

export function CVParsing({ cvId, userId }: { cvId: string; userId: string }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useCvParse(cvId, userId);
  const retryParse = useRetryParse(cvId, userId);

  if (query.isPending)
    return (
      <p role="status" className="text-sm">
        Loading parsing status…
      </p>
    );

  if (query.isError)
    return (
      <div>
        <FieldError>Unable to load parsing status.</FieldError>
        <Button variant="link" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );

  const result = query.data.parse;
  const status = result?.status;

  return (
    <div className="space-y-3 pt-2">
      <ParsingStatus
        status={status}
        errorCode={result?.errorCode}
        retryPending={retryParse.isPending}
        retryError={retryParse.error?.message}
        onRetry={() => retryParse.mutate()}
      />

      {status === "completed" && result?.extractedData && (
        <>
          <Button
            variant="outline"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Close review" : "Review extracted CV"}
          </Button>

          {open && (
            <CVReviewForm
              key={result.id}
              cvId={cvId}
              initial={query.data.review?.data ?? result.extractedData}
              rawText={result.rawText ?? ""}
              onSaved={async () => {
                await client.invalidateQueries({ queryKey: cvParseKey(userId, cvId) });
                await client.invalidateQueries({ queryKey: ["setup", userId] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
