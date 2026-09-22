export class JobImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type JobField = {
  name: string;
  type: string;
  options: { value: string; label: string; freeForm?: boolean }[];
  // Set by the adapter that built this field, not inferred later from naming
  // conventions: which ATS a question came from should never matter to code
  // that decides whether it needs a personal, non-CV-derivable answer.
  category?: "demographic" | "consent";
};

export type JobQuestion = {
  label: string;
  required: boolean;
  description: string;
  fields: JobField[];
};

export type JobSection = {
  title: string;
  description: string;
  questions: JobQuestion[];
};

export type ImportedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  sourceURL: string;
  sections: JobSection[];
};
