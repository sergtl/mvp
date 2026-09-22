export function JobDescription({ description }: { description: string }) {
  return (
    <details open>
      <summary className="cursor-pointer font-medium">Job description</summary>
      <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {description}
      </div>
    </details>
  );
}
