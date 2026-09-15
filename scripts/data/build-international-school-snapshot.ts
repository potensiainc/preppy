import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { manifestFileNames, type InternationalSchoolManifest } from "../../src/modules/international-school-import/artifact-schema";
import { canonicalJsonSha256 } from "../../src/modules/international-school-import/validator";
import {
  CANDIDATE_SCHOOLS,
  INTERNATIONAL_SCHOOL_EVIDENCE,
  INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT,
  INTERNATIONAL_SCHOOL_PACKAGE_ID,
  INTERNATIONAL_SCHOOL_PROGRESS,
  INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE,
  OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS,
  SPECIAL_ACCESS_RECORDS,
} from "./international-school-source-data";

const DEFAULT_OUTPUT = "data/snapshots/preppy/international-school/sg-is-20260915-r01";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const ndjson = (values: readonly unknown[]) => `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const isiNumber = (value: { registryExternalId: string }) => Number(value.registryExternalId.slice(5));

export async function buildInternationalSchoolSnapshot(
  outputDirectory: string,
): Promise<InternationalSchoolManifest> {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const snapshot = {
    ...INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT,
    institutions: [...INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT.institutions].sort((a, b) => isiNumber(a) - isiNumber(b)),
  };
  const contents = {
    "institutions.ndjson": ndjson([...OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS].sort((a, b) => isiNumber(a) - isiNumber(b))),
    "evidence.ndjson": ndjson([...INTERNATIONAL_SCHOOL_EVIDENCE].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))),
    "social-evidence.ndjson": ndjson([...INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE].sort((a, b) => a.socialEvidenceId.localeCompare(b.socialEvidenceId))),
    "special-access.ndjson": ndjson([...SPECIAL_ACCESS_RECORDS].sort((a, b) => a.recordId.localeCompare(b.recordId))),
    "candidates.ndjson": ndjson([...CANDIDATE_SCHOOLS].sort((a, b) => a.recordId.localeCompare(b.recordId))),
    "progress.json": json(INTERNATIONAL_SCHOOL_PROGRESS),
    "preppy-import.snapshot.json": json(snapshot),
  } satisfies Record<(typeof manifestFileNames)[number], string>;

  await Promise.all(manifestFileNames.map((filename) => writeFile(resolve(directory, filename), contents[filename], "utf8")));
  const manifest: InternationalSchoolManifest = {
    schemaVersion: 1,
    packageId: INTERNATIONAL_SCHOOL_PACKAGE_ID,
    files: Object.fromEntries(manifestFileNames.map((filename) => [filename, sha256(contents[filename])])) as InternationalSchoolManifest["files"],
    preppyImportChecksum: canonicalJsonSha256(snapshot),
  };
  await writeFile(resolve(directory, "manifest.json"), json(manifest), "utf8");
  await writeFile(resolve(directory, "verification.json"), json({
    schemaVersion: 1,
    packageId: INTERNATIONAL_SCHOOL_PACKAGE_ID,
    status: "PENDING",
    checkedAt: null,
    checks: [],
    readyForDryRun: false,
  }), "utf8");
  return manifest;
}

function option(name: string): string | undefined {
  return process.argv.slice(2).find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const manifest = await buildInternationalSchoolSnapshot(option("output") ?? DEFAULT_OUTPUT);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
