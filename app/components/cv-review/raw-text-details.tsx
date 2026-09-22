export function RawTextDetails({ rawText }: { rawText: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm">Extracted text</summary>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
        {rawText}
      </pre>
    </details>
  );
}
