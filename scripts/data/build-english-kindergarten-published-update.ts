// Builds a schemaVersion 2 package that updates already-published
// English-kindergarten campuses from a reviewed values file.
//
// Usage:
//   tsx scripts/data/build-english-kindergarten-published-update.ts \
//     --review <reviewed values JSON> --identity <identity JSON> --out <dir>
//
// The identity file is an array of the target database's own rows
// ({ slug, displayName, addressLine, district, websiteUrl, operationalState }),
// so the package matches the published roots exactly instead of re-deriving
// names and addresses from public pages.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  importSnapshotSchema,
  type CampusRecord,
  type EvidenceRecord,
} from "../../src/modules/english-kindergarten-import/artifact-schema";
import {
  canonicalJsonSha256,
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "../../src/modules/english-kindergarten-import/validator";

type ReviewedEvidence = Readonly<{
  url: string;
  sourceType: EvidenceRecord["sourceType"];
  fetchOutcome: EvidenceRecord["fetchOutcome"];
  excerpt: string;
}>;

type ReviewedCampus = Readonly<{
  slug: string;
  legalDong: string;
  evidence: Readonly<Record<string, ReviewedEvidence>>;
  identityEvidence: string;
  coverages: readonly Readonly<{
    section: string;
    status: string;
    evidence: string | null;
    academicYearLabel: string | null;
    publicNote: string | null;
    internalNote: string | null;
  }>[];
  facts: readonly Readonly<{
    factType: string;
    value: unknown;
    displayText: string | null;
    evidence: readonly string[];
  }>[];
}>;

type Review = Readonly<{
  packageId: string;
  checkedAt: string;
  campuses: readonly ReviewedCampus[];
}>;

type Identity = Readonly<{
  slug: string;
  displayName: string;
  addressLine: string;
  district: string;
  websiteUrl: string | null;
  operationalState: "ACTIVE" | "UNKNOWN";
}>;

function option(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(
      "Usage: --review <file> --identity <file> --out <directory>",
    );
  }
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const review = JSON.parse(
    await readFile(option("--review"), "utf8"),
  ) as Review;
  const identities = JSON.parse(
    await readFile(option("--identity"), "utf8"),
  ) as Identity[];
  const directory = resolve(option("--out"));
  const identityBySlug = new Map(identities.map((row) => [row.slug, row]));
  const collectedAt = review.checkedAt;

  const campuses: CampusRecord[] = [];
  const evidence: EvidenceRecord[] = [];
  const institutions = review.campuses.map((campus) => {
    const identity = identityBySlug.get(campus.slug);
    if (!identity) throw new Error(`${campus.slug}: identity row missing`);
    const campusId = campus.slug;
    campuses.push({
      campusId,
      displayName: identity.displayName,
      slug: identity.slug,
      addressLine: identity.addressLine,
      district: identity.district,
      legalDong: campus.legalDong,
      operationalState: identity.operationalState,
      classificationState: "CONFIRMED",
      officialChannels: identity.websiteUrl
        ? [{ kind: "WEBSITE", value: identity.websiteUrl }]
        : [],
      collectedAt,
    });
    const record = (
      key: string,
      evidenceId: string,
      claimType: EvidenceRecord["claimType"],
    ): EvidenceRecord => {
      const source = campus.evidence[key];
      if (!source) throw new Error(`${campus.slug}: evidence ${key} missing`);
      return {
        evidenceId,
        campusId,
        claimType,
        sourceUrl: source.url,
        finalUrl: source.url,
        sourceType: source.sourceType,
        authorityLevel: "PRIMARY",
        fetchOutcome: source.fetchOutcome,
        sourceTextExcerpt: source.excerpt,
        boundedExcerpt: source.excerpt,
        collectedAt,
        sourceContentSha256: sha256(source.excerpt),
      };
    };
    for (const claimType of [
      "IDENTITY",
      "OPERATION",
      "CLASSIFICATION",
    ] as const) {
      evidence.push(
        record(
          campus.identityEvidence,
          `${campusId}-${claimType.toLowerCase()}`,
          claimType,
        ),
      );
    }
    for (const key of Object.keys(campus.evidence)) {
      evidence.push(record(key, `${campusId}-${key}`, "FACT"));
    }
    return {
      campusId,
      category: "ENGLISH_KINDERGARTEN" as const,
      publicationState: "PUBLISHED" as const,
      coverages: campus.coverages.map((coverage) => ({
        section: coverage.section,
        status: coverage.status,
        evidenceId: coverage.evidence
          ? `${campusId}-${coverage.evidence}`
          : null,
        academicYearLabel: coverage.academicYearLabel,
        publicNote: coverage.publicNote,
        internalNote: coverage.internalNote,
        lastCollectedAt: coverage.evidence ? collectedAt : null,
        lastCheckedAt: collectedAt,
      })),
      facts: campus.facts.map((fact) => ({
        factType: fact.factType,
        value: fact.value,
        displayText: fact.displayText,
        evidenceIds: fact.evidence.map((key) => `${campusId}-${key}`),
        verifiedAt: collectedAt,
      })),
      opportunities: [],
      reviewInsight: null,
    };
  });

  const snapshot = {
    schemaVersion: 2 as const,
    packageId: review.packageId,
    institutions,
  };
  const count = (values: readonly string[]) =>
    Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((value) => [
          value,
          values.filter((item) => item === value).length,
        ]),
    );
  const identityOutcomes = evidence
    .filter((item) => item.claimType === "IDENTITY")
    .map((item) => item.fetchOutcome);
  const progress = {
    packageId: review.packageId,
    confirmed: campuses.length,
    excluded: 0,
    held: 0,
    recordsReviewed: campuses.length,
    districts: count(campuses.map((item) => item.district)),
    legalDongs: count(campuses.map((item) => item.legalDong)),
    sourceFetches: {
      success: identityOutcomes.filter((item) => item === "SUCCESS").length,
      accessFailed: identityOutcomes.filter((item) => item === "ACCESS_FAILED")
        .length,
      checkedNotFound: identityOutcomes.filter(
        (item) => item === "CHECKED_NOT_FOUND",
      ).length,
    },
  };

  await mkdir(directory, { recursive: true });
  const files = {
    "campuses.ndjson":
      campuses.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "evidence.ndjson":
      evidence.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "progress.json": JSON.stringify(progress, null, 2) + "\n",
    "preppy-import.snapshot.json": JSON.stringify(snapshot, null, 2) + "\n",
  };
  const manifest = {
    schemaVersion: 1 as const,
    packageId: review.packageId,
    files: Object.fromEntries(
      Object.entries(files).map(([filename, contents]) => [
        filename,
        sha256(contents),
      ]),
    ),
    // The loader checks the checksum of the parsed snapshot, which
    // normalizes fact values.
    preppyImportChecksum: canonicalJsonSha256(
      importSnapshotSchema.parse(snapshot),
    ),
  };
  await Promise.all([
    ...Object.entries(files).map(([filename, contents]) =>
      writeFile(resolve(directory, filename), contents, "utf8"),
    ),
    writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    ),
  ]);

  const loaded = await loadEnglishKindergartenPackage(directory);
  const report = validateEnglishKindergartenPackage(loaded);
  if (report.status !== "PASS") {
    throw new Error(JSON.stringify(report.errors, null, 2));
  }
  process.stdout.write(
    `${JSON.stringify({ packageChecksum: report.packageChecksum, counts: report.counts }, null, 2)}\n`,
  );
}

await main();
