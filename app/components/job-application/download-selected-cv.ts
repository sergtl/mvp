export type ParsedCV = { id: string; filename: string };

// Downloads the chosen parsed CV's original PDF bytes as a File, ready to
// attach to a resume upload field. Shared by the attach button and by
// generation's own pre-attach step.
export async function downloadSelectedCV(cvs: ParsedCV[] | undefined, selectedCV: string) {
  const cv = cvs?.find((item) => item.id === selectedCV);

  if (!cv) throw new Error("Choose a parsed CV first.");

  const response = await fetch(`/api/cvs/${cv.id}`);

  if (!response.ok)
    throw new Error("Unable to attach your CV. Refresh your CVs and try again.");

  const blob = await response.blob();

  if (blob.type !== "application/pdf" || !blob.size)
    throw new Error("The selected CV must be a PDF.");

  return { cvId: cv.id, file: new File([blob], cv.filename, { type: "application/pdf" }) };
}
