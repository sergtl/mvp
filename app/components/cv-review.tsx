"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/ui/field";
import { extractedCVSchema, parseErrors, type ExtractedCV, type ParseResponse } from "@/lib/cv/extraction-schema";

async function json(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "The request failed. Please try again.");
  return value;
}

export function CVParsing({ cvId, userId }: { cvId: string; userId: string }) {
  const client = useQueryClient();
  const key = ["cv-parse", userId, cvId];
  const [open, setOpen] = useState(false);
  const query = useQuery<ParseResponse>({
    queryKey: key,
    queryFn: async ({ signal }) => json(await fetch(`/api/cvs/${cvId}/parse`, { signal })),
    refetchInterval: (q) => ["queued", "processing"].includes(q.state.data?.parse?.status ?? "") ? 3000 : false,
    refetchOnWindowFocus: false,
  });
  const parse = useMutation({
    mutationFn: async () => json(await fetch(`/api/cvs/${cvId}/parse`, { method: "POST" })),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); },
  });
  if (query.isPending) return <p role="status" className="text-sm">Loading parsing status…</p>;
  if (query.isError) return <div><FieldError>Unable to load parsing status.</FieldError><Button variant="link" onClick={() => void query.refetch()}>Try again</Button></div>;
  const result = query.data.parse;
  const status = result?.status;
  return (
    <div className="space-y-3 pt-2">
      {status === "queued" && <p role="status" className="text-sm text-muted-foreground">Queued for parsing…</p>}
      {status === "processing" && <p role="status" className="text-sm text-muted-foreground">Reading your CV…</p>}
      {(status === "failed" || status === "needs_ocr") && <FieldError>{parseErrors[result?.errorCode ?? ""] ?? "Parsing failed. Please try again."}</FieldError>}
      {(!status || status === "failed" || status === "needs_ocr") && (
        <Button variant="outline" disabled={parse.isPending} onClick={() => parse.mutate()}>
          {parse.isPending ? "Queuing…" : status ? "Retry parsing" : "Parse CV"}
        </Button>
      )}
      {parse.error && <FieldError>{parse.error.message}</FieldError>}
      {status === "completed" && result?.extractedData && (
        <>
          <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close review" : "Review extracted CV"}</Button>
          {open && <CVReview key={result.id} cvId={cvId} initial={query.data.review?.data ?? result.extractedData} rawText={result.rawText ?? ""} onSaved={async () => { await client.invalidateQueries({ queryKey: key }); }} />}
        </>
      )}
    </div>
  );
}

function CVReview({ cvId, initial, rawText, onSaved }: { cvId: string; initial: ExtractedCV; rawText: string; onSaved: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  const form = useForm<ExtractedCV>({ resolver: zodResolver(extractedCVSchema), defaultValues: initial });
  const experience = useFieldArray({ control: form.control, name: "experience" });
  const education = useFieldArray({ control: form.control, name: "education" });
  const mutation = useMutation({
    mutationFn: async (data: ExtractedCV) => json(await fetch(`/api/cvs/${cvId}/review`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })),
    onSuccess: async (_, values) => { form.reset(values); setSaved(true); await onSaved(); },
  });
  const areaClass = "min-h-24 w-full rounded-md border bg-background p-2 text-sm";
  return (
    <form className="space-y-4 rounded-lg border p-4" noValidate onChange={() => setSaved(false)} onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
      <p className="text-sm text-muted-foreground">Review the extracted details and correct anything missing or inaccurate.</p>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <h3 className="font-semibold">Contact details</h3>
        {(["name", "email", "phone", "location"] as const).map((name) => (
          <label key={name} className="block space-y-1 text-sm capitalize">{name}<Input {...form.register(`contact.${name}`)} /></label>
        ))}
        <Controller control={form.control} name="contact.links" render={({ field }) => (
          <label className="block text-sm">Links (one per line)<textarea className={areaClass} value={field.value.join("\n")} onChange={(event) => field.onChange(event.target.value.split("\n"))} /></label>
        )} />
        <label className="block text-sm">Summary<textarea className={areaClass} {...form.register("summary")} /></label>
        <h3 className="font-semibold">Experience</h3>
        {experience.fields.map((entry, i) => (
          <div key={entry.id} className="space-y-2 rounded border p-3">
            {(["company", "title", "startDate", "endDate"] as const).map((name) => (
              <label key={name} className="block text-sm">{{ company: "Company", title: "Title", startDate: "Start date", endDate: "End date" }[name]}<Input {...form.register(`experience.${i}.${name}`)} /></label>
            ))}
            <label className="block text-sm">Description<textarea className={areaClass} {...form.register(`experience.${i}.description`)} /></label>
            <Button type="button" variant="link" onClick={() => experience.remove(i)}>Remove experience</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => experience.append({ company: "", title: "", startDate: "", endDate: "", description: "" })}>Add experience</Button>
        <h3 className="font-semibold">Education</h3>
        {education.fields.map((entry, i) => (
          <div key={entry.id} className="space-y-2 rounded border p-3">
            {(["institution", "qualification", "startDate", "endDate"] as const).map((name) => (
              <label key={name} className="block text-sm">{{ institution: "Institution", qualification: "Qualification", startDate: "Start date", endDate: "End date" }[name]}<Input {...form.register(`education.${i}.${name}`)} /></label>
            ))}
            <Button type="button" variant="link" onClick={() => education.remove(i)}>Remove education</Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => education.append({ institution: "", qualification: "", startDate: "", endDate: "" })}>Add education</Button>
        {(["skills", "languages"] as const).map((name) => (
          <Controller key={name} control={form.control} name={name} render={({ field }) => (
            <label className="block text-sm capitalize">{name} (one per line)<textarea className={areaClass} value={field.value.join("\n")} onChange={(event) => field.onChange(event.target.value.split("\n"))} /></label>
          )} />
        ))}
        {Object.keys(form.formState.errors).length > 0 && <FieldError>One or more fields are too long, or there are too many entries. Shorten the review and try again.</FieldError>}
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save reviewed CV"}</Button>
      </fieldset>
      {mutation.error && <FieldError>{mutation.error.message}</FieldError>}
      {saved && <p role="status" className="text-sm">Your corrections were saved.</p>}
      <details><summary className="cursor-pointer text-sm">Extracted text</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{rawText}</pre></details>
    </form>
  );
}
