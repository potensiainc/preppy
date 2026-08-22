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
  readonly effectiveAt: string;
  readonly contentReference: string;
};

const currentLegalPolicies = Object.freeze({
  TERMS_OF_SERVICE: Object.freeze({
    type: "TERMS_OF_SERVICE",
    version: "2026-08-23",
    effectiveAt: "2026-08-23T00:00:00+09:00",
    contentReference: "legal/terms/2026-08-23",
  }),
  PRIVACY_POLICY: Object.freeze({
    type: "PRIVACY_POLICY",
    version: "2026-08-23",
    effectiveAt: "2026-08-23T00:00:00+09:00",
    contentReference: "legal/privacy/2026-08-23",
  }),
  SERVICE_EMAIL_UPDATES: Object.freeze({
    type: "SERVICE_EMAIL_UPDATES",
    version: "2026-08-23",
    effectiveAt: "2026-08-23T00:00:00+09:00",
    contentReference: "legal/service-email-updates/2026-08-23",
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
