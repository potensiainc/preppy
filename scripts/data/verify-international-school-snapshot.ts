import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  CANDIDATE_COUNT,
  OFFICIAL_ACTIVE_COUNT,
  SPECIAL_ACCESS_COUNT,
  verificationSchema,
  type InternationalSchoolVerification,
} from "../../src/modules/international-school-import/artifact-schema";
import { loadInternationalSchoolPackage, validateInternationalSchoolPackage } from "../../src/modules/international-school-import/validator";

const DEFAULT_DIRECTORY = "data/snapshots/preppy/international-school/sg-is-20260915-r01";

export async function verifyInternationalSchoolSnapshot(directory: string): Promise<InternationalSchoolVerification> {
  const packageValue = await loadInternationalSchoolPackage(directory);
  const validation = validateInternationalSchoolPackage(packageValue);
  const officialIds = new Set(packageValue.institutions.map((item) => item.registryExternalId));
  const snapshotIds = new Set(packageValue.snapshot.institutions.map((item) => item.registryExternalId));
  const exactCounts =
    packageValue.institutions.length === OFFICIAL_ACTIVE_COUNT &&
    packageValue.specialAccess.length === SPECIAL_ACCESS_COUNT &&
    packageValue.candidates.length === CANDIDATE_COUNT &&
    packageValue.snapshot.institutions.length === OFFICIAL_ACTIVE_COUNT;
  const importBoundary =
    snapshotIds.size === officialIds.size &&
    [...snapshotIds].every((id) => officialIds.has(id)) &&
    packageValue.snapshot.institutions.every((item) => item.category === "INTERNATIONAL_SCHOOL" && item.publicationState === "DRAFT");
  const identityComplete = packageValue.institutions.every((institution) =>
    packageValue.evidence.some((evidence) =>
      evidence.institutionRegistryId === institution.registryExternalId &&
      evidence.claimType === "IDENTITY" && evidence.status === "VERIFIED" &&
      evidence.sourceObservationRef !== null && evidence.sourceSnapshotId !== null,
    ),
  );
  const checks = [
    { name: "strict schema and reference validation", status: validation.status },
    { name: "raw file and canonical snapshot checksums", status: validation.checksumsValid ? "PASS" : "FAIL" },
    { name: "official special-access and candidate counts", status: exactCounts ? "PASS" : "FAIL" },
    { name: "official-only draft import boundary", status: importBoundary ? "PASS" : "FAIL" },
    { name: "captured official identity evidence", status: identityComplete ? "PASS" : "FAIL" },
  ] as const;
  const passed = checks.every((check) => check.status === "PASS");
  const verification = verificationSchema.parse({
    schemaVersion: 1,
    packageId: packageValue.manifest.packageId,
    status: passed ? "PASS" : "FAIL",
    checkedAt: new Date().toISOString(),
    checks,
    readyForDryRun: passed,
  });
  await writeFile(resolve(directory, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
  return verification;
}

function option(name: string): string | undefined {
  return process.argv.slice(2).find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const verification = await verifyInternationalSchoolSnapshot(option("dir") ?? DEFAULT_DIRECTORY);
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  process.exitCode = verification.status === "PASS" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
