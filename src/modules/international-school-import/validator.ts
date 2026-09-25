/**
 * Validation utilities for international school import packages.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { InternationalSchoolImportPackage } from "./artifact-schema";

export type ValidationStatus = "PASS" | "FAIL";

export type ValidationResult = Readonly<{
  status: ValidationStatus;
  errors: readonly string[];
  warnings: readonly string[];
}>;

/**
 * Produces a stable JSON representation for checksum computation.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasStringArray(
  obj: Record<string, unknown>,
  key: string,
): obj is Record<string, unknown> & { [K in typeof key]: string[] } {
  const value = obj[key];
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Validates the structure and semantic rules of an international school
 * import package.
 */
export function validateInternationalSchoolPackage(
  value: unknown,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(value)) {
    return { status: "FAIL", errors: ["Package must be an object"], warnings };
  }

  const pkg = value as Record<string, unknown>;

  // Validate snapshot metadata
  if (!isObject(pkg.snapshot)) {
    errors.push("Missing or invalid snapshot metadata");
  } else {
    const snapshot = pkg.snapshot;
    if (typeof snapshot.packageId !== "string" || !snapshot.packageId) {
      errors.push("snapshot.packageId is required");
    }
    if (typeof snapshot.packageVersion !== "string") {
      errors.push("snapshot.packageVersion is required");
    }
    if (typeof snapshot.exportedAt !== "string") {
      errors.push("snapshot.exportedAt is required");
    }
    if (!hasStringArray(snapshot, "scope") || snapshot.scope.length === 0) {
      errors.push("snapshot.scope must be a non-empty array of strings");
    }
  }

  // Validate institutions array
  if (!Array.isArray(pkg.institutions)) {
    errors.push("institutions must be an array");
  } else {
    const institutionRefs = new Set<string>();
    const registryIds = new Set<string>();
    const slugs = new Set<string>();

    for (let i = 0; i < pkg.institutions.length; i++) {
      const inst = pkg.institutions[i];
      if (!isObject(inst)) {
        errors.push(`institutions[${i}] must be an object`);
        continue;
      }

      if (typeof inst.institutionRef !== "string" || !inst.institutionRef) {
        errors.push(`institutions[${i}].institutionRef is required`);
      } else if (institutionRefs.has(inst.institutionRef)) {
        errors.push(
          `Duplicate institutionRef: ${inst.institutionRef}`,
        );
      } else {
        institutionRefs.add(inst.institutionRef);
      }

      if (
        typeof inst.registryExternalId !== "string" ||
        !inst.registryExternalId
      ) {
        errors.push(`institutions[${i}].registryExternalId is required`);
      } else if (registryIds.has(inst.registryExternalId)) {
        errors.push(
          `Duplicate registryExternalId: ${inst.registryExternalId}`,
        );
      } else {
        registryIds.add(inst.registryExternalId);
      }

      if (typeof inst.slug !== "string" || !inst.slug) {
        errors.push(`institutions[${i}].slug is required`);
      } else if (slugs.has(inst.slug)) {
        errors.push(`Duplicate slug: ${inst.slug}`);
      } else {
        slugs.add(inst.slug);
      }

      if (inst.status !== "OFFICIAL") {
        if (inst.status === "SPECIAL_ACCESS") {
          // Special access institutions should be in specialAccess array
        } else if (inst.status === "CANDIDATE") {
          // Candidate institutions should be in candidates array
        }
      }
    }
  }

  // Validate evidence array
  if (!Array.isArray(pkg.evidence)) {
    errors.push("evidence must be an array");
  } else {
    const evidenceIds = new Set<string>();
    for (let i = 0; i < pkg.evidence.length; i++) {
      const ev = pkg.evidence[i];
      if (!isObject(ev)) {
        errors.push(`evidence[${i}] must be an object`);
        continue;
      }
      if (typeof ev.evidenceId !== "string" || !ev.evidenceId) {
        errors.push(`evidence[${i}].evidenceId is required`);
      } else if (evidenceIds.has(ev.evidenceId)) {
        errors.push(`Duplicate evidenceId: ${ev.evidenceId}`);
      } else {
        evidenceIds.add(ev.evidenceId);
      }
    }
  }

  // Validate facts array
  if (!Array.isArray(pkg.facts)) {
    errors.push("facts must be an array");
  }

  // Validate opportunities array
  if (!Array.isArray(pkg.opportunities)) {
    errors.push("opportunities must be an array");
  }

  // Validate coverages array
  if (!Array.isArray(pkg.coverages)) {
    errors.push("coverages must be an array");
  }

  // Validate optional arrays
  if (pkg.candidates !== undefined && !Array.isArray(pkg.candidates)) {
    errors.push("candidates must be an array if present");
  }

  if (pkg.specialAccess !== undefined && !Array.isArray(pkg.specialAccess)) {
    errors.push("specialAccess must be an array if present");
  }

  if (pkg.socialEvidence !== undefined && !Array.isArray(pkg.socialEvidence)) {
    errors.push("socialEvidence must be an array if present");
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    errors,
    warnings,
  };
}

/**
 * Loads an international school import package from a directory.
 *
 * Expects the directory to contain a `package.json` file with the full
 * package structure.
 */
export async function loadInternationalSchoolPackage(
  directory: string,
): Promise<InternationalSchoolImportPackage> {
  const files = await readdir(directory);
  const packageFile = files.find(
    (f) => f === "package.json" || f.endsWith("-package.json"),
  );
  if (!packageFile) {
    throw new Error(
      `No package.json found in directory: ${directory}`,
    );
  }

  const content = await readFile(join(directory, packageFile), "utf8");
  const parsed = JSON.parse(content) as InternationalSchoolImportPackage;
  return parsed;
}
