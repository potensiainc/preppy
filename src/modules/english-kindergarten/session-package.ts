import { createHash } from "node:crypto";
import { z } from "zod";
const httpsUrl = z.url().refine((value) => {
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password;
});
const instant = z.iso.datetime({ offset: true });
export const sessionPackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: z.string().min(1).max(100),
    campuses: z
      .array(
        z
          .object({
            slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            mode: z.enum(["CREATE", "EXISTING"]),
            updateAddress: z.boolean().default(false),
            expectedInstitutionId: z.uuid().nullable(),
            expectedName: z.string().nullable(),
            expectedAddress: z.string().nullable(),
            name: z.string().min(1).max(200),
            officialAddress: z.string().min(5).max(500),
            officialRegion: z.string().min(1).max(100),
            officialCampusId: z
              .object({
                namespace: z.string().min(1),
                value: z.string().min(1),
              })
              .strict()
              .nullable(),
            officialCampusUrl: httpsUrl.nullable(),
            identityEvidenceKeys: z.array(z.string().min(1)).min(1).max(8),
          })
          .strict(),
      )
      .max(500)
      .default([]),
    sources: z
      .array(
        z
          .object({
            key: z.string().min(1),
            url: httpsUrl,
            name: z.string().min(1).max(200),
            checkedAt: instant,
            normalizedText: z.string().min(20).max(200000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    sessions: z
      .array(
        z
          .object({
            institutionSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            expectedCurrentVersionId: z.uuid().nullable(),
            sessionKey: z
              .string()
              .max(81)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            officialSessionId: z
              .object({
                namespace: z.string().min(1),
                value: z.string().min(1),
              })
              .strict()
              .nullable()
              .default(null),
            programAsPublished: z
              .string()
              .min(1)
              .max(500)
              .nullable()
              .default(null),
            targetAsPublished: z.string().min(1).max(500),
            academicYear: z.number().int().min(2026).max(2100),
            targetAges: z.array(z.number().int().min(3).max(7)).max(5),
            birthYears: z
              .array(z.number().int().min(2010).max(2100))
              .max(5)
              .default([]),
            eventStartsAt: instant,
            eventEndsAt: instant.nullable().default(null),
            applicationOpensAt: instant.nullable().default(null),
            applicationClosesAt: instant.nullable(),
            reservationState: z.enum([
              "UNKNOWN",
              "CLOSED",
              "OPEN_AS_PUBLISHED",
              "CONFLICTING",
              "WAITLIST",
              "CANCELLED",
            ]),
            note: z.string().min(1).max(3000),
            actionUrl: httpsUrl.nullable(),
            evidenceKeys: z.array(z.string().min(1)).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = new Set(value.sources.map((s) => s.key));
    if (keys.size !== value.sources.length)
      ctx.addIssue({ code: "custom", message: "Duplicate evidence key" });
    const identities = new Set<string>();
    const campusSlugs = new Set(value.campuses.map((c) => c.slug));
    const officialIdentities = value.campuses.flatMap((c) =>
      c.officialCampusId
        ? [`${c.officialCampusId.namespace}:${c.officialCampusId.value}`]
        : [],
    );
    if (
      new Set(officialIdentities).size !== officialIdentities.length ||
      value.campuses.some(
        (c) =>
          c.mode === "CREATE" &&
          (c.expectedInstitutionId !== null ||
            c.expectedName !== null ||
            c.expectedAddress !== null ||
            c.updateAddress),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Duplicate official campus identity or invalid create preconditions",
      });
    if (
      campusSlugs.size !== value.campuses.length ||
      value.campuses.some(
        (c) =>
          c.identityEvidenceKeys.some((k) => !keys.has(k)) ||
          !value.sessions.some((s) => s.institutionSlug === c.slug),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Duplicate campus, missing identity evidence or no dated session",
      });
    const occurrenceIdentities = new Set<string>();
    for (const row of value.sessions) {
      const occurrence = JSON.stringify([
        row.institutionSlug,
        new Date(row.eventStartsAt).toISOString(),
        sessionIdentityFingerprint(row, value.sources),
      ]);
      if (occurrenceIdentities.has(occurrence))
        ctx.addIssue({
          code: "custom",
          message: "Duplicate session occurrence under a different key",
        });
      occurrenceIdentities.add(occurrence);
      const identity = sessionSlug(row);
      if (
        identities.has(identity) ||
        new Set(row.targetAges).size !== row.targetAges.length ||
        new Set(row.evidenceKeys).size !== row.evidenceKeys.length ||
        row.evidenceKeys.some((key) => !keys.has(key))
      )
        ctx.addIssue({
          code: "custom",
          message: "Duplicate session/age or unknown evidence",
        });
      identities.add(identity);
      if (
        row.applicationOpensAt &&
        row.applicationClosesAt &&
        new Date(row.applicationOpensAt) > new Date(row.applicationClosesAt)
      )
        ctx.addIssue({ code: "custom", message: "Invalid booking window" });
      if (
        row.eventEndsAt &&
        new Date(row.eventEndsAt) < new Date(row.eventStartsAt)
      )
        ctx.addIssue({ code: "custom", message: "Invalid event window" });
    }
  });
export type SessionPackage = z.infer<typeof sessionPackageSchema>;
export type SessionRecord = SessionPackage["sessions"][number];
export function sessionSlug(
  row: Pick<SessionRecord, "institutionSlug" | "sessionKey" | "academicYear">,
) {
  return `${row.institutionSlug}-briefing-${row.academicYear}-${row.sessionKey}`;
}

export function sessionAudience(row: SessionRecord) {
  return `${row.academicYear}학년도 · 기관 표기 ${
    [...row.targetAges]
      .sort()
      .map((age) => `${age}세`)
      .join(", ") || "연령 미공개"
  } · ${row.targetAsPublished}${row.birthYears.length ? ` · ${row.birthYears.join("·")}년생` : ""}`;
}
export function packageChecksum(value: SessionPackage) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function sessionState(
  row: SessionRecord,
): "OPEN" | "CLOSED" | "CANCELLED" | "UNKNOWN" {
  return row.reservationState === "OPEN_AS_PUBLISHED"
    ? "OPEN"
    : row.reservationState === "CLOSED" || row.reservationState === "WAITLIST"
      ? "CLOSED"
      : row.reservationState === "CANCELLED"
        ? "CANCELLED"
        : "UNKNOWN";
}

/** Same occurrence only when campus/time AND reviewed audience, program, evidence and official ID agree.
 * A key is a stable storage locator, never proof of a distinct simultaneous session. */
export function sessionIdentityFingerprint(
  row: SessionRecord,
  sources: SessionPackage["sources"],
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        year: row.academicYear,
        ages: [...row.targetAges].sort(),
        births: [...row.birthYears].sort(),
        audience: row.targetAsPublished,
        program: row.programAsPublished ?? row.note,
        officialId: row.officialSessionId,
        evidence: row.evidenceKeys
          .map((key) => {
            const s = sources.find((s) => s.key === key);
            if (!s) return [key, "UNKNOWN_EVIDENCE"];
            return [
              s.url,
              createHash("sha256").update(s.normalizedText).digest("hex"),
            ];
          })
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      }),
    )
    .digest("hex");
}
