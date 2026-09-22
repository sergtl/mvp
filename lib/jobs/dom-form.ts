import type { Page, Locator, FrameLocator, Frame } from "playwright";
import type { JobQuestion, JobSection } from "./types";
import type { SubmissionInput, SubmissionFile } from "../submissions/types";

// A plain Page for a standard-rendered form, a live Frame/FrameLocator when
// the form lives inside an iframe — all expose the same `.locator()`/
// `.getByText()` surface this module relies on.
export type Root = Page | Locator | FrameLocator | Frame;

export async function hasVisibleFields(root: Root) {
  return (await root.locator("input, select, textarea").filter({ visible: true }).count()) > 0;
}

// Real-world evidence (a live Lever posting) showed a naive "first iframe
// with any matching elements" picking up hCaptcha's own hidden internal
// inputs instead of the real, top-level page form. Preferring the page
// itself, and only falling back to a frame that actually has *visible*
// fields, avoids being fooled by a third-party widget's iframe.
export async function resolveFormRoot(page: Page): Promise<Root> {
  if (await hasVisibleFields(page)) return page;

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await hasVisibleFields(frame).catch(() => false)) return frame;
  }

  return page;
}

// Shared by the Ashby and Lever adapters, not Greenhouse: those two expose no
// API for a posting's application questions, so both read them straight out
// of the rendered form. Deliberately flat (one "Application" section, no
// sub-grouping): a wrong section boundary is cosmetic, a wrong field is not,
// and section boundaries are the least reliable thing to infer from markup.
// UNVERIFIED against real Ashby/Lever postings — see the adapters' own notes.
export async function readDomForm(root: Root): Promise<JobSection[]> {
  const controls = root.locator("input, select, textarea").filter({ visible: true });
  const count = await controls.count();
  const questions: JobQuestion[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const tag = await control.evaluate((el) => el.tagName.toLowerCase());
    const rawType = tag === "input" ? ((await control.getAttribute("type")) || "text").toLowerCase() : tag;

    if (["hidden", "submit", "button", "reset"].includes(rawType)) continue;

    const name = (await control.getAttribute("name")) || (await control.getAttribute("id"));
    // A CAPTCHA widget's own hidden response field (e.g. reCAPTCHA's
    // g-recaptcha-response textarea), not a real application question.
    if (!name || seenNames.has(name) || /captcha/i.test(name)) continue;
    seenNames.add(name);

    const label = await labelFor(root, control, name);
    const required =
      (await control.getAttribute("required")) !== null ||
      (await control.getAttribute("aria-required")) === "true";

    if (rawType === "checkbox") {
      const group = root.locator(`[name=${JSON.stringify(name)}]`);
      if ((await group.count()) === 1) {
        questions.push({
          label,
          required,
          description: "",
          fields: [{ name, type: "consent", options: [] }],
        });
        continue;
      }
      questions.push({
        label,
        required,
        description: "",
        fields: [{ name, type: "multi_value_multi_select", options: await optionsFor(root, group) }],
      });
      continue;
    }

    if (rawType === "radio") {
      const group = root.locator(`[name=${JSON.stringify(name)}]`);
      questions.push({
        label,
        required,
        description: "",
        fields: [{ name, type: "multi_value_single_select", options: await optionsFor(root, group) }],
      });
      continue;
    }

    if (tag === "select") {
      const multiple = (await control.getAttribute("multiple")) !== null;
      const options = await control.locator("option").evaluateAll((els) =>
        els
          .map((el) => ({ value: (el as HTMLOptionElement).value, label: (el.textContent || "").trim() }))
          .filter((o) => o.value),
      );
      questions.push({
        label,
        required,
        description: "",
        fields: [{ name, type: multiple ? "multi_value_multi_select" : "multi_value_single_select", options }],
      });
      continue;
    }

    if (rawType === "file") {
      questions.push({ label, required, description: "", fields: [{ name, type: "input_file", options: [] }] });
      continue;
    }

    questions.push({
      label,
      required,
      description: "",
      fields: [{ name, type: tag === "textarea" ? "textarea" : "input_text", options: [] }],
    });
  }

  return [{ title: "Application", description: "", questions }];
}

async function optionsFor(root: Root, group: Locator) {
  const n = await group.count();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const item = group.nth(i);
    const value = (await item.getAttribute("value")) || "";
    if (!value) continue;
    const id = await item.getAttribute("id");
    const label = id ? await textOfLabelFor(root, id) : "";
    options.push({ value, label: label || value });
  }
  return options;
}

async function textOfLabelFor(root: Root, id: string) {
  const label = root.locator(`label[for=${JSON.stringify(id)}]`).first();
  return (await label.count()) ? ((await label.textContent()) || "").trim() : "";
}

// Association order matches how a sighted user reads the form: an explicit
// <label for>, then aria-label/aria-labelledby, then a wrapping <label>,
// falling back to the field's own name so nothing is ever unlabeled.
async function labelFor(root: Root, control: Locator, name: string): Promise<string> {
  const id = await control.getAttribute("id");

  if (id) {
    const byFor = await textOfLabelFor(root, id);
    if (byFor) return byFor;
  }

  const ariaLabel = await control.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = await control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = (
      await Promise.all(
        labelledBy
          .split(/\s+/)
          .map((refId) =>
            root
              .locator(`[id=${JSON.stringify(refId)}]`)
              .first()
              .textContent()
              .catch(() => ""),
          ),
      )
    )
      .join(" ")
      .trim();
    if (text) return text;
  }

  const wrapping = control.locator("xpath=ancestor::label[1]");
  if (await wrapping.count()) {
    const text = ((await wrapping.first().textContent()) || "").trim();
    if (text) return text;
  }

  return name;
}

export async function fillDomForm(
  root: Root,
  snapshot: SubmissionInput,
  files: SubmissionFile[],
): Promise<string[]> {
  const unresolved: string[] = [];

  for (const [s, section] of snapshot.job.sections.entries()) {
    for (const [q, question] of section.questions.entries()) {
      for (const [f, field] of question.fields.entries()) {
        const id = `${s}-${q}-${f}`;
        const file = files.find((file) => file.fieldId === id);
        const value = snapshot.answers[id];

        if (
          field.type === "input_hidden" ||
          (!file &&
            (value === undefined || value === "" || (Array.isArray(value) && !value.length)))
        )
          continue;

        try {
          const control = await findByName(root, field.name);

          if (file) {
            await control.setInputFiles({ name: file.filename, mimeType: file.contentType, buffer: file.content });
          } else if (field.type === "consent") {
            await control.setChecked(value === true);
          } else if (field.type.startsWith("multi_value_")) {
            const values = Array.isArray(value) ? value : [String(value)];
            const tag = await control.evaluate((el) => el.tagName.toLowerCase());

            if (tag === "select") {
              await control.selectOption(values);
            } else {
              for (const selected of values) {
                const option = field.options.find((o) => o.value === selected);
                if (!option) throw new Error("unknown_option");
                await root
                  .locator(`[name=${JSON.stringify(field.name)}][value=${JSON.stringify(selected)}]`)
                  .check();
              }
            }

            if (values.some((v) => field.options.find((o) => o.value === v)?.freeForm))
              throw new Error("free_form");
          } else {
            await control.fill(String(value));
            await control.blur();
          }
        } catch {
          unresolved.push(question.label);
        }
      }
    }
  }

  return [...new Set(unresolved)];
}

// Shared with the Ashby/Lever adapters: neither's confirmation markup is
// documented, so this looks for generic "thank you"-style receipt language
// rather than a platform-specific selector. UNVERIFIED against real postings.
export const confirmationText =
  /thank you for applying|thank you for your application|application (?:has been |was )?(?:successfully )?(?:submitted|received)|we (?:have )?received your application|your application (?:has been |was )?(?:successfully )?(?:submitted|received)/i;

export async function isGenericConfirmation(root: Root) {
  const formVisible = (await root.locator("input, select, textarea").filter({ visible: true }).count()) > 0;
  const receipt = root.getByText(confirmationText);
  return !formVisible && (await receipt.first().isVisible().catch(() => false));
}

async function findByName(root: Root, name: string): Promise<Locator> {
  const byName = root.locator(`[name=${JSON.stringify(name)}]`).first();
  if (await byName.count()) return byName;

  const byId = root.locator(`[id=${JSON.stringify(name)}]`);
  if (await byId.count()) return byId;

  throw new Error("field_not_found");
}
