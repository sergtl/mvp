import type { ExtractedCV } from "../cv/extraction-schema";
import { countryName, scopeCovers, scopesInText } from "../geo/regions";
import type { ImportedJob, JobField } from "../jobs/greenhouse";
import { routeScopes, type DemographicKey, type Profile } from "./schema";

// Answers a form question from facts the user stated in their profile. It never
// infers: when the profile has no explicit fact, or the wording or options are
// ambiguous, the question is left for the existing AI/manual flow.

export type ProfileValue = string | string[] | boolean;
export type ProfileAnswer = { id: string; value: ProfileValue; slot: string };

type Ask = {
  label: string;
  description: string;
  section: string;
  field: JobField;
};

// undefined: not this slot's question. null: this slot's question, but the
// profile cannot answer it (stop looking). Otherwise the answer.
type Slot = (
  ask: Ask,
  profile: Profile,
  cv: ExtractedCV | undefined,
) => ProfileValue | null | undefined;

const isText = (field: JobField) =>
  field.type === "input_text" || field.type === "textarea";

const isSelect = (field: JobField) =>
  field.type === "multi_value_single_select" ||
  field.type === "multi_value_multi_select";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// The option whose label satisfies `match`, only when exactly one does. Free-form
// options ("Other, please specify") are never selected.
function pick(field: JobField, match: (label: string) => boolean) {
  const found = field.options.filter((o) => !o.freeForm && match(o.label));

  if (found.length !== 1) return null;

  return field.type === "multi_value_multi_select"
    ? [found[0].value]
    : found[0].value;
}

function yesNo(field: JobField, yes: boolean) {
  if (isText(field)) return yes ? "Yes" : "No";

  return isSelect(field)
    ? pick(field, (label) => normalize(label) === (yes ? "yes" : "no"))
    : null;
}

const hasYesNo = (field: JobField) =>
  isText(field) ||
  (isSelect(field) &&
    ["yes", "no"].every(
      (word) =>
        field.options.filter((o) => normalize(o.label) === word).length === 1,
    ));

// The scope a question is about: from its label, else from its description.
function namedScope({ label, description }: Ask) {
  const scopes = scopesInText(label);
  const found = scopes.length ? scopes : scopesInText(description);

  return found.length === 1 ? found[0] : null;
}

const covers = (profile: Profile, how: "employee" | "employee_sponsored", scope: string) =>
  routeScopes(profile, how).some((route) => scopeCovers(route, scope));

const AUTHORIZED =
  /authori[sz](?:ed|ation)[^?.]*\bwork|\bwork[^?.]*authori[sz]|legally[^?.]*\bwork|\bwork[^?.]*\blegally|right to work|eligible to work|permitted to work/i;
const SPONSOR = /sponsor/i;
const WITHOUT_SPONSOR =
  /without[^?.]*sponsor|(?:do not|don't|not) (?:require|need)[^?.]*sponsor/i;
const REQUIRES_SPONSOR =
  /\b(?:require|requires|need|needs)\b[^?.]*sponsor|sponsor[^?.]*\b(?:required|needed)\b/i;

// Never answers "No" to an authorization question: a contractor abroad often
// cannot truthfully say Yes, and an automatic No can disqualify them. The user
// decides those.
const workAuthorization: Slot = (ask, profile) => {
  const { label } = ask;
  const authorized = AUTHORIZED.test(label);
  const sponsorship = SPONSOR.test(label);

  if (!authorized && !sponsorship) return undefined;

  const scope = namedScope(ask);

  if (!scope) return null;

  const employee = covers(profile, "employee", scope);

  if (WITHOUT_SPONSOR.test(label))
    return employee ? yesNo(ask.field, true) : null;

  // Two questions in one field: no safe way to orient a single answer.
  if (authorized && sponsorship) return null;

  if (authorized) return employee ? yesNo(ask.field, true) : null;

  if (!REQUIRES_SPONSOR.test(label)) return null;

  if (employee) return yesNo(ask.field, false);

  return covers(profile, "employee_sponsored", scope)
    ? yesNo(ask.field, true)
    : null;
};

const RESIDES = /\b(?:reside|resides|residing|resident|live|living|located|based)\b/i;

const relocation: Slot = (ask, profile) => {
  if (!/relocat/i.test(ask.label)) return undefined;

  // "Are you in Berlin or willing to relocate?" is two questions in one.
  if (RESIDES.test(ask.label) || profile.relocation === "ask") return null;

  return hasYesNo(ask.field) ? yesNo(ask.field, profile.relocation === "yes") : null;
};

const residence: Slot = (ask, profile) => {
  const home = profile.eligibility.residenceCountry;

  if (!home || !RESIDES.test(ask.label)) return undefined;

  if (/relocat|willing|open to|able to|comfortable/i.test(ask.label))
    return undefined;

  const scope = namedScope(ask);

  if (scope && hasYesNo(ask.field))
    return yesNo(ask.field, scopeCovers(scope, home));

  if (scope || !/\bcountry\b/i.test(ask.label)) return undefined;

  if (isText(ask.field)) return countryName(home);

  return isSelect(ask.field)
    ? pick(ask.field, (label) => {
        const found = scopesInText(label);
        return found.length === 1 && found[0] === home;
      })
    : null;
};

const CONTRACT =
  /(?:open to|willing to|comfortable|happy to|available (?:for|as|on)|interested in|able to work)[^?.]*\b(?:contract(?:or)?|b2b|freelanc\w*)\b|\bb2b\b/i;

const contractWork: Slot = (ask, profile) => {
  if (!CONTRACT.test(ask.label) || !hasYesNo(ask.field)) return undefined;

  // Only a stated contractor route counts; its absence is not a "No".
  return routeScopes(profile, "contractor").length
    ? yesNo(ask.field, true)
    : null;
};

const SALARY =
  /salary|compensation|(?:pay|rate|comp)\s+expectation|expected\s+(?:pay|rate|comp)|desired\s+(?:pay|rate|comp)|hourly rate|day rate/i;

const amounts = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const salary: Slot = (ask, profile) => {
  if (!SALARY.test(ask.label)) return undefined;

  if (!isText(ask.field)) return null;

  const { employee, contractor } = profile.compensation;
  let asEmployee = "";
  let asContractor = "";

  // A figure without a currency is ambiguous, so it is not used.
  if (employee.currency && (employee.min !== null || employee.max !== null)) {
    const { min, max, currency } = employee;

    asEmployee = `${
      min !== null && max !== null
        ? `${currency} ${amounts.format(min)}–${amounts.format(max)}`
        : min !== null
          ? `${currency} ${amounts.format(min)}+`
          : `up to ${currency} ${amounts.format(max!)}`
    } per year`;
  }

  if (contractor.currency && contractor.amount !== null)
    asContractor = `${contractor.currency} ${amounts.format(contractor.amount)} per ${contractor.unit}`;

  if (asEmployee && asContractor)
    return `${asEmployee} as an employee, or ${asContractor} as a B2B contractor`;

  if (asContractor) return `${asContractor} as a B2B contractor`;

  return asEmployee || null;
};

const START =
  /start date|notice period|when (?:can|could|would|are) you[^?.]*(?:start|join|available)|available to start|earliest[^?.]*start/i;

const startDate: Slot = (ask, profile) => {
  if (!START.test(ask.label)) return undefined;

  const value = profile.availability.startDate.trim();

  return isText(ask.field) && value ? value : null;
};

const LINKS = {
  linkedin: /linked[ _-]?in/i,
  github: /git[ _-]?hub/i,
  portfolio: /portfolio|personal (?:web)?site|\bwebsite\b/i,
} as const;

function cvLink(cv: ExtractedCV | undefined, host: string) {
  const found = (cv?.contact.links ?? []).filter((link) => {
    try {
      const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
      return url.hostname === host || url.hostname.endsWith(`.${host}`);
    } catch {
      return false;
    }
  });

  if (found.length !== 1) return "";

  return /^https?:\/\//i.test(found[0]) ? found[0] : `https://${found[0]}`;
}

const links: Slot = (ask, profile, cv) => {
  const text = `${ask.label} ${ask.description}`;
  const kinds = (Object.keys(LINKS) as (keyof typeof LINKS)[]).filter((kind) =>
    LINKS[kind].test(text),
  );

  // A question asking for several links is left to the AI/manual flow.
  if (kinds.length !== 1 || !isText(ask.field)) return undefined;

  const [kind] = kinds;
  const value =
    profile.links[kind] ||
    (kind === "linkedin"
      ? cvLink(cv, "linkedin.com")
      : kind === "github"
        ? cvLink(cv, "github.com")
        : "");

  return value || undefined;
};

const EEO_SECTION = /equal opportunity|demographic|voluntary|self-identif/i;
const DECLINE =
  /decline|prefer not|do not wish|don't wish|choose not|do not want to answer|don't want to answer|not to (?:say|disclose|answer|identify)/i;

function demographicKey({ label, field }: Ask): DemographicKey | null {
  const text = `${label} ${field.name}`;

  if (/hispanic|latin[oax]/i.test(text)) return "hispanic";
  if (/sexual[ _]orientation/i.test(text)) return "sexualOrientation";
  if (/veteran/i.test(text)) return "veteran";
  if (/disabilit/i.test(text)) return "disability";
  if (/(?:^|[^a-z])race(?:[^a-z]|$)|ethnic/i.test(text)) return "race";
  if (/gender/i.test(text)) return "gender";

  return null;
}

const demographics: Slot = (ask, profile) => {
  if (
    !isSelect(ask.field) ||
    !(EEO_SECTION.test(ask.section) || ask.field.name.startsWith("demographic_"))
  )
    return undefined;

  const key = demographicKey(ask);

  if (!key) return undefined;

  const { mode, answer } = profile.demographics[key];

  if (mode === "decline") return pick(ask.field, (label) => DECLINE.test(label));

  if (mode === "answer" && answer.trim())
    return pick(
      ask.field,
      (label) => normalize(label) === normalize(answer),
    );

  return null;
};

// Only an explicit "agree" in the profile ever ticks a consent box.
const consent: Slot = ({ field }, profile) => {
  if (field.type !== "consent" || !field.name.startsWith("gdpr_"))
    return undefined;

  const choice =
    field.name === "gdpr_demographic_data_consent_given"
      ? profile.consents.demographicData
      : profile.consents.dataProcessing;

  return choice === "agree" ? true : null;
};

const slots: [string, Slot][] = [
  ["consent", consent],
  ["demographics", demographics],
  ["workAuthorization", workAuthorization],
  ["relocation", relocation],
  ["residence", residence],
  ["contractWork", contractWork],
  ["salary", salary],
  ["startDate", startDate],
  ["links", links],
];

export function resolveFromProfile(
  job: ImportedJob,
  profile: Profile,
  cv?: ExtractedCV,
): ProfileAnswer[] {
  const answers: ProfileAnswer[] = [];

  job.sections.forEach((section, s) =>
    section.questions.forEach((question, q) => {
      const visible = question.fields.flatMap((field, f) =>
        field.type === "input_hidden" || field.type === "input_file"
          ? []
          : [{ field, f }],
      );

      // Resume/cover-letter style alternatives are not profile questions.
      if (
        visible.length !== 1 ||
        question.fields.some((field) => field.type === "input_file")
      )
        return;

      const [{ field, f }] = visible;
      const ask = {
        label: question.label,
        description: question.description,
        section: section.title,
        field,
      };

      for (const [name, resolve] of slots) {
        const value = resolve(ask, profile, cv);

        if (value === undefined) continue;

        if (value !== null && value !== "")
          answers.push({ id: `${s}-${q}-${f}`, value, slot: name });

        return;
      }
    }),
  );

  return answers;
}
