import "server-only";

import { ConsentPolicyUpdatedError } from "@/src/application/errors";

export const legalPolicyTypes = Object.freeze([
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
  "SERVICE_EMAIL_UPDATES",
] as const);

export type LegalPolicyType = (typeof legalPolicyTypes)[number];

export type LegalPolicy = {
  readonly type: LegalPolicyType;
  readonly version: string;
  readonly effectiveAt: string | null;
  readonly contentReference: string;
};

const currentLegalPolicies = Object.freeze({
  TERMS_OF_SERVICE: Object.freeze({
    type: "TERMS_OF_SERVICE",
    version: "2026-09-26",
    effectiveAt: "2026-09-26",
    contentReference: "/terms",
  }),
  PRIVACY_POLICY: Object.freeze({
    type: "PRIVACY_POLICY",
    version: "2026-09-26",
    effectiveAt: "2026-09-26",
    contentReference: "/privacy",
  }),
  SERVICE_EMAIL_UPDATES: Object.freeze({
    type: "SERVICE_EMAIL_UPDATES",
    version: "2026-09-26",
    effectiveAt: "2026-09-26",
    contentReference: "/privacy#email-updates",
  }),
} satisfies Record<LegalPolicyType, LegalPolicy>);

export function getCurrentLegalPolicy(type: LegalPolicyType): LegalPolicy {
  return { ...currentLegalPolicies[type] };
}

export function getCurrentLegalPolicyVersions(): Record<
  LegalPolicyType,
  string
> {
  return {
    TERMS_OF_SERVICE: currentLegalPolicies.TERMS_OF_SERVICE.version,
    PRIVACY_POLICY: currentLegalPolicies.PRIVACY_POLICY.version,
    SERVICE_EMAIL_UPDATES: currentLegalPolicies.SERVICE_EMAIL_UPDATES.version,
  };
}

export function assertCurrentLegalPolicyVersion(
  type: string,
  version: string,
): void {
  if (!isLegalPolicyType(type) || version.trim().length === 0) {
    throw new ConsentPolicyUpdatedError();
  }

  if (currentLegalPolicies[type].version !== version) {
    throw new ConsentPolicyUpdatedError();
  }
}

function isLegalPolicyType(type: string): type is LegalPolicyType {
  return Object.hasOwn(currentLegalPolicies, type);
}

/** Publication tracks the effective documents, independently of optional feature rollout. */
export function getLegalPublicationState(): {
  readonly ready: boolean;
  readonly blockers: readonly string[];
} {
  const blockers = legalPolicyTypes.filter(
    (type) => !currentLegalPolicies[type].effectiveAt,
  );
  return { ready: blockers.length === 0, blockers };
}
