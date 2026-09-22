"use client";

import { useMemo, useState } from "react";
import type { ImportedJob } from "@/lib/jobs/types";
import { answerTargets } from "@/lib/jobs/answers";
import { AnswersForm } from "./answers-form";
import { CvSelector } from "./cv-selector";
import { EligibilityBanner } from "./eligibility-banner";
import { JobDescription } from "./job-description";
import { JobHeader } from "./job-header";
import { SubmissionPanel } from "./submission-panel";
import { useAnswerDraft } from "./use-answer-draft";
import { useCvAttachment } from "./use-cv-attachment";
import { useEligibility } from "./use-eligibility";
import { useGenerateAnswers } from "./use-generate-answers";
import { useParsedCvs } from "./use-parsed-cvs";
import { useRegenerateAnswer } from "./use-regenerate-answer";

// One loaded job: everything from the description down to Apply.
export function JobApplication({ job, userId }: { job: ImportedJob; userId: string }) {
  const [cvId, setCvId] = useState("");
  const draft = useAnswerDraft(job);
  const cvs = useParsedCvs(userId);
  const selectedCV = cvId || cvs.data?.cvs[0]?.id || "";
  const eligibility = useEligibility(job, userId);
  const contractors = eligibility.data?.requirements.contractors.policy;

  // Questions the AI may draft, so a regenerate control can be offered.
  const draftable = useMemo(
    () =>
      new Set(
        answerTargets(job, { includeOptional: true })
          .filter((target) => !target.manualReason)
          .map((target) => target.questionKey),
      ),
    [job],
  );

  const attach = useCvAttachment({ draft, cvs: cvs.data?.cvs, selectedCV });
  const generate = useGenerateAnswers({ job, draft, cvs: cvs.data?.cvs, selectedCV, contractors });
  const regenerate = useRegenerateAnswer({ job, draft, selectedCV, contractors });

  const onSelectCv = (id: string) => {
    setCvId(id);
    generate.reset();
    attach.reset();
  };

  return (
    <div className="space-y-6">
      <JobHeader job={job} />
      <EligibilityBanner query={eligibility} />
      <JobDescription description={job.description} />
      <CvSelector
        job={job}
        cvs={cvs}
        selectedCV={selectedCV}
        onSelectCv={onSelectCv}
        attach={attach}
        generate={generate}
        notice={draft.notice}
        clearNotice={draft.clearNotice}
      />
      <AnswersForm
        job={job}
        draft={draft}
        draftable={draftable}
        selectedCV={selectedCV}
        busy={generate.isPending || attach.isPending}
        regenerate={regenerate}
      />
      <SubmissionPanel
        job={job}
        userId={userId}
        answers={draft.answers}
        freeText={draft.freeText}
        attachments={draft.attachments}
        busy={generate.isPending || attach.isPending}
      />
    </div>
  );
}
