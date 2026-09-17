import { execFile } from "node:child_process";
import path from "node:path";
import { ParseFailure } from "./ai";

export function extractPDF(content: Buffer): Promise<string> {
  // A separate process lets us actually terminate CPU-bound PDF parsing.
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        "--max-old-space-size=256",
        "--import",
        "tsx",
        path.join(process.cwd(), "workers/pdf-text.ts"),
      ],
      { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, killSignal: "SIGKILL" },
      (error, stdout) => {
        if (error)
          return reject(
            new ParseFailure(error.killed ? "pdf_timeout" : "invalid_pdf"),
          );
        try {
          const result = JSON.parse(stdout);

          if (result.error) return reject(new ParseFailure(result.error));

          if (typeof result.text !== "string")
            return reject(new ParseFailure("invalid_pdf"));

          resolve(result.text);
        } catch {
          reject(new ParseFailure("invalid_pdf"));
        }
      },
    );
    child.stdin?.on("error", () => {
      /* Early exit is handled by the callback. */
    });
    child.stdin?.end(content);
  });
}
