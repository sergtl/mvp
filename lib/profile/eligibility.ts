import { countryName, scopeCovers, scopeLabel } from "../geo/regions";
import { noRequirements, type JobRequirements } from "../jobs/requirements";
import { routeScopes, type Profile } from "./schema";

export type Finding = {
  level: "ok" | "blocked" | "unclear";
  text: string;
  // Verbatim from the posting.
  quote?: string;
};

export type Eligibility = {
  verdict: "eligible" | "blocked" | "unclear";
  findings: Finding[];
};

// Regions companies define differently: falling outside one is "unclear", not "blocked".
const FUZZY = new Set(["EUROPE", "EMEA", "LATAM", "APAC"]);

const list = (scopes: string[]) => scopes.map(scopeLabel).join(" or ");

// Compares what the user says they can do with what a posting says it needs.
// Never guesses: anything the posting or the profile leaves open is "unclear".
export function checkEligibility(
  profile: Profile,
  requirements: JobRequirements = noRequirements,
): Eligibility {
  const { residenceCountry, citizenships } = profile.eligibility;

  const employee = routeScopes(profile, "employee");
  const sponsored = routeScopes(profile, "employee_sponsored");
  const contractor = routeScopes(profile, "contractor");

  const { authorization, residency, citizenship, sponsorship, contractors } =
    requirements;

  const findings: Finding[] = [];

  const add = (level: Finding["level"], text: string, quote?: string) =>
    findings.push({ level, text, ...(quote ? { quote } : {}) });

  const restricted =
    authorization.scopes.length ||
    residency.scopes.length ||
    citizenship.scopes.length;

  if (restricted && !residenceCountry && !profile.eligibility.routes.length)
    add(
      "unclear",
      "Add where you live and where you can work to your profile to check this.",
    );

  if (residency.scopes.length && residenceCountry) {
    const home = countryName(residenceCountry);

    if (residency.scopes.some((scope) => scopeCovers(scope, residenceCountry)))
      add(
        "ok",
        `You live in ${home}, which the posting accepts.`,
        residency.quote,
      );
    else if (residency.scopes.some((scope) => FUZZY.has(scope)))
      add(
        "unclear",
        `The posting asks for candidates in ${list(residency.scopes)}; you live in ${home}. Companies define this region differently, so it may still work.`,
        residency.quote,
      );
    else
      add(
        "blocked",
        `The posting asks for candidates in ${list(residency.scopes)}; you live in ${home}.`,
        residency.quote,
      );
  }

  if (
    authorization.scopes.length &&
    (employee.length || sponsored.length || contractor.length)
  ) {
    const wants = authorization.scopes;
    const covered = (routes: string[]) =>
      wants.some((want) => routes.some((route) => scopeCovers(route, want)));

    if (covered(employee))
      add(
        "ok",
        `You're authorized to work in ${list(wants)}.`,
        authorization.quote,
      );
    else if (covered(sponsored) && sponsorship.offered === "offered")
      add(
        "ok",
        `You'd need visa sponsorship for ${list(wants)}, and the posting offers it.`,
        sponsorship.quote,
      );
    else if (covered(sponsored) && sponsorship.offered === "unknown")
      add(
        "unclear",
        `You'd need visa sponsorship for ${list(wants)}; the posting doesn't say whether it's offered.`,
        authorization.quote,
      );
    else if (contractor.length && contractors.policy === "accepted")
      add(
        "ok",
        `The posting requires work authorization in ${list(wants)}, but it accepts contractors, so you could apply as a B2B contractor.`,
        contractors.quote,
      );
    else if (contractor.length && contractors.policy === "unknown")
      add(
        "unclear",
        `The posting requires work authorization in ${list(wants)}. You could apply as a B2B contractor, but it doesn't say whether it takes contractors.`,
        authorization.quote,
      );
    else
      add(
        "blocked",
        contractors.policy === "not_accepted" && contractor.length
          ? `The posting requires work authorization in ${list(wants)} and says it doesn't take contractors.`
          : `The posting requires work authorization in ${list(wants)}, which your profile doesn't cover.`,
        contractors.policy === "not_accepted"
          ? contractors.quote
          : authorization.quote,
      );
  }

  if (citizenship.scopes.length) {
    if (!citizenships.length)
      add(
        "unclear",
        "The posting asks for a specific citizenship. Add yours to your profile to check.",
        citizenship.quote,
      );
    else if (
      citizenship.scopes.some((scope) =>
        citizenships.some((code) => scopeCovers(scope, code)),
      )
    )
      add(
        "ok",
        "You hold a citizenship the posting asks for.",
        citizenship.quote,
      );
    else
      add(
        "blocked",
        `The posting asks for ${list(citizenship.scopes)} citizenship.`,
        citizenship.quote,
      );
  }

  if (!findings.length && restricted)
    add("unclear", "Add where you can work to your profile to check this.");
  else if (!findings.length)
    add(
      "ok",
      "The posting doesn't state a location or work-authorization requirement.",
    );

  return {
    verdict: findings.some((f) => f.level === "blocked")
      ? "blocked"
      : findings.some((f) => f.level === "unclear")
        ? "unclear"
        : "eligible",
    findings,
  };
}
