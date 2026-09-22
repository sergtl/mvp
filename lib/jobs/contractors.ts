export const CONTRACTOR_POLICIES = ["accepted", "not_accepted", "unknown"] as const;

export type Contractors = (typeof CONTRACTOR_POLICIES)[number];
