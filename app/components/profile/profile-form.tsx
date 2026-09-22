"use client";

import type { Profile } from "@/lib/profile/schema";
import { CompensationSection } from "./compensation-section";
import { ConsentSection } from "./consent-section";
import { EligibilitySection } from "./eligibility-section";
import { LinksSection } from "./links-section";
import { ProjectsSection } from "./projects-section";
import { SaveStatusBar } from "./save-status-bar";
import { useProfileAutosave } from "./use-profile-autosave";

export function ProfileForm({
  initial,
  savedAt,
}: {
  initial: Profile;
  savedAt: string | null;
}) {
  const autosave = useProfileAutosave(initial, savedAt);

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        autosave.saveNow();
      }}
    >
      <SaveStatusBar status={autosave.status} savedAt={autosave.savedAt} />
      <EligibilitySection form={autosave.form} />
      <CompensationSection form={autosave.form} />
      <ProjectsSection form={autosave.form} />
      <LinksSection form={autosave.form} />
      <ConsentSection form={autosave.form} />
    </form>
  );
}
