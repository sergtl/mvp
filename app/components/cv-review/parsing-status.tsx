import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { parseErrors, type ParseStatus } from "@/lib/cv/extraction-schema";

export function ParsingStatus({
  status,
  errorCode,
  retryPending,
  retryError,
  onRetry,
}: {
  status: ParseStatus | undefined;
  errorCode: string | null | undefined;
  retryPending: boolean;
  retryError?: string;
  onRetry: () => void;
}) {
  return (
    <>
      {status === "queued" && (
        <p role="status" className="text-sm text-muted-foreground">
          Queued for parsing…
        </p>
      )}
      {status === "processing" && (
        <p role="status" className="text-sm text-muted-foreground">
          Reading your CV…
        </p>
      )}
      {(status === "failed" || status === "needs_ocr") && (
        <FieldError>
          {parseErrors[errorCode ?? ""] ?? "Parsing failed. Please try again."}
        </FieldError>
      )}
      {(!status || status === "failed" || status === "needs_ocr") && (
        <Button variant="outline" disabled={retryPending} onClick={onRetry}>
          {retryPending ? "Queuing…" : status ? "Retry parsing" : "Parse CV"}
        </Button>
      )}
      {retryError && <FieldError>{retryError}</FieldError>}
    </>
  );
}
