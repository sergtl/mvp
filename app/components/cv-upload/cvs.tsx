import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { CVMetadata } from "@/lib/cv/config";
import { useQuery } from "@tanstack/react-query";
import { CVParsing } from "../cv-review";

export function CVs({ userId }: { userId: string }) {
  const queryKey = ["cvs", userId];

  const cvs = useQuery<{ cvs: CVMetadata[] }>({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/cvs", { signal });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The request failed. Please try again.");
      }
      return response.json();
    },
  });

  return (
    <div className="space-y-3">
      {cvs.isPending ? (
        <p role="status">Loading your CVs…</p>
      ) : cvs.isError ? (
        <div className="space-y-2">
          <FieldError>{cvs.error.message}</FieldError>
          <Button variant="outline" onClick={() => void cvs.refetch()}>
            Try again
          </Button>
        </div>
      ) : cvs.data.cvs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You haven’t uploaded a CV yet.
        </p>
      ) : (
        <ul className="divide-y">
          {cvs.data.cvs.map((cv) => (
            <li key={cv.id} className="space-y-1 py-3">
              <a
                href={`/api/cvs/${cv.id}`}
                className="break-all font-medium underline underline-offset-4"
              >
                {cv.filename}
              </a>

              <p className="text-xs text-muted-foreground">
                {Math.max(1, Math.ceil(cv.sizeBytes / 1024))} KB ·{" "}
                {new Date(cv.createdAt).toLocaleDateString()}
              </p>

              {cv.contentType === "application/pdf" ? (
                <CVParsing cvId={cv.id} userId={userId} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Parsing is available for PDFs only.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
