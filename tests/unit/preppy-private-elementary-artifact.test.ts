/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately malformed external JSON is mutated in rejection tests. */
import { beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";
import {
  artifactChecksum,
  createBootstrapArtifact,
  validateBootstrapArtifact,
} from "@/src/modules/institution-detail-bootstrap/artifact.server";
import {
  artifactTestCollection,
  artifactTestTime,
} from "@/tests/support/private-elementary-artifact";
import { extractLiveAdmissionProposal } from "@/src/modules/live-admissions/extractor";
import { liveAdmissionContentFingerprint } from "@/src/modules/live-admissions/preparation.server";

let loaded: Awaited<ReturnType<typeof loadPrivateElementaryBootstrapTargets>>;
beforeAll(async () => {
  const seed = await loadPrivateElementaryBootstrapTargets(
    resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  loaded = {
    ...seed,
    targets: seed.targets.map((t) =>
      t.slug === "lila"
        ? { ...t, institutionId: "00000000-0000-4000-8000-000000000002" }
        : t,
    ),
  };
});
function sample() {
  return createBootstrapArtifact(
    artifactTestCollection(loaded.targets.find((t) => t.slug === "lila")!),
    loaded.seedSha256,
    artifactTestTime,
  );
}
function validate(value: unknown) {
  return validateBootstrapArtifact(
    value,
    loaded.targets,
    loaded.seedSha256,
    artifactTestTime,
  );
}
function mutate(change: (value: any) => void, resign = true) {
  const value = JSON.parse(JSON.stringify(sample()));
  change(value);
  if (resign && value.admission) {
    const proposal = { ...value.admission };
    for (const key of [
      "applicationOpenAt",
      "applicationCloseAt",
      "eventStartAt",
      "eventEndAt",
    ])
      proposal[key] = proposal[key] === null ? null : new Date(proposal[key]);
    if (
      [
        proposal.applicationOpenAt,
        proposal.applicationCloseAt,
        proposal.eventStartAt,
        proposal.eventEndAt,
      ].every((date) => date === null || Number.isFinite(date.getTime()))
    )
      value.admission.contentFingerprint =
        liveAdmissionContentFingerprint(proposal);
  }
  if (resign) value.artifactChecksum = artifactChecksum(value);
  return value;
}

describe("offline school artifact validation", () => {
  it("keeps one provenance page when aliases converge, preserving the admission collection timestamp", () => {
    const collection = artifactTestCollection(
      loaded.targets.find((t) => t.slug === "lila")!,
    );
    const page = collection.pages[1]!;
    const input = createBootstrapArtifact(
      {
        ...collection,
        pages: [
          collection.pages[0]!,
          { ...page, collectedAt: new Date("2026-08-30T07:58:00.000Z") },
          page,
        ],
      },
      loaded.seedSha256,
      artifactTestTime,
    );
    expect(() => validate(input)).not.toThrow();
    expect(input.collection.pages).toHaveLength(2);
    expect(input.sources).toHaveLength(3);
    expect(input.collection.pages[1]!.collectedAt).toBe(
      "2026-08-30T07:59:00.000Z",
    );
  });

  it("rejects an HTTP action URL when the official website requires HTTPS", () => {
    const original = loaded.targets.find((t) => t.slug === "lila")!;
    const target = {
      ...original,
      websiteUrl: original.websiteUrl.replace(/^http:/u, "https:"),
    };
    const collection = artifactTestCollection(target);
    const proposal = {
      ...collection.admission!.proposal,
      actionUrl: collection.admission!.proposal.actionUrl.replace(
        /^https:/u,
        "http:",
      ),
    };
    const input = createBootstrapArtifact(
      { ...collection, admission: { ...collection.admission!, proposal } },
      loaded.seedSha256,
      artifactTestTime,
    );
    expect(() =>
      validateBootstrapArtifact(
        input,
        loaded.targets.map((t) => (t.slug === target.slug ? target : t)),
        loaded.seedSha256,
        artifactTestTime,
      ),
    ).toThrow();
  });

  it.each(["2026-11-09T00:00:00.000Z", "2026-11-14T00:00:00.000Z"])(
    "rejects an outdated UPCOMING artifact at %s",
    (now) => {
      expect(() =>
        validateBootstrapArtifact(
          sample(),
          loaded.targets,
          loaded.seedSha256,
          new Date(now),
        ),
      ).toThrow();
    },
  );

  it.each([
    {
      html: "<h1>학교 소개</h1><p>공식 교육과정 안내</p>",
      kind: "OTHER",
      state: "NOT_FOUND",
    },
    {
      html: "<h1>2027학년도 입학 안내</h1><p>2027학년도 입학 일정은 추후 공지합니다.</p>",
      kind: "OTHER",
      state: "NOT_ANNOUNCED",
    },
    {
      html: "<h1>2027학년도 입학 설명회</h1><p>2027학년도 입학 설명회 2026년 10월 10일 10:00</p>",
      kind: "INFORMATION_SESSION",
      state: "SCHEDULE_FOUND",
    },
    {
      html: "<h1>2028학년도 입학 안내</h1><p>2028학년도 원서접수 2027년 11월 9일 ~ 11월 13일</p>",
      kind: "RECRUITMENT",
      state: "SCHEDULE_FOUND",
    },
  ])("round-trips real extractor $state/$kind", ({ html, kind, state }) => {
    const collection = artifactTestCollection(
      loaded.targets.find((t) => t.slug === "lila")!,
    );
    const proposal = extractLiveAdmissionProposal({
      html,
      sourceUrl: collection.admission!.sourceUrl,
      classificationHint: "ADMISSIONS",
      targetAcademicYearLabel: "2027학년도",
      referenceTime: artifactTestTime,
    });
    expect(proposal.kind).toBe(kind);
    expect(proposal.knowledgeState).toBe(state);
    const artifact = createBootstrapArtifact(
      { ...collection, admission: { ...collection.admission!, proposal } },
      loaded.seedSha256,
      artifactTestTime,
    );
    expect(validate(artifact).admission?.proposal.kind).toBe(kind);
  });

  it("preserves an extracted official PDF's original octet-stream MIME", () => {
    const collection = artifactTestCollection(
      loaded.targets.find((t) => t.slug === "lila")!,
    );
    const page = collection.pages[1]!;
    const url = new URL("/admission.pdf", collection.target.websiteUrl).href;
    const modified = {
      ...collection,
      pages: [
        collection.pages[0]!,
        {
          ...page,
          url,
          finalUrl: url,
          mimeType: "application/octet-stream",
          sourceType: "OFFICIAL_DOCUMENT" as const,
        },
      ],
      facts: collection.facts.slice(0, 2),
      admission: {
        ...collection.admission!,
        sourceUrl: url,
        proposal: { ...collection.admission!.proposal, actionUrl: url },
      },
    };
    const artifact = createBootstrapArtifact(
      modified,
      loaded.seedSha256,
      artifactTestTime,
    );
    expect(validate(artifact).pages[1]?.mimeType).toBe(
      "application/octet-stream",
    );
  });
  it("round-trips canonical values and bounded provenance without raw HTML or verifiedAt", () => {
    const artifact = sample();
    const result = validate(artifact);
    expect(result.target.slug).toBe("lila");
    expect(artifact.collection.pages[0]!.canonicalUrl).toBe(
      new URL(loaded.targets.find((t) => t.slug === "lila")!.websiteUrl).href,
    );
    expect(result.facts.map((f) => f.factType)).toEqual([
      "OPERATING_INFO",
      "TARGET_AGE_GRADE",
      "TUITION",
    ]);
    expect(result.facts[2]!.displayText).toContain("2025학년도");
    expect(result.admission?.proposal.applicationOpenAt?.toISOString()).toBe(
      "2026-11-08T15:00:00.000Z",
    );
    expect(result.admission?.collectedAt.toISOString()).toBe(
      "2026-08-30T07:59:00.000Z",
    );
    expect(JSON.stringify(artifact)).not.toContain("extractionHtml");
    expect(JSON.stringify(artifact)).not.toContain("verifiedAt");
    expect(JSON.stringify(artifact)).not.toContain("<p>");
    expect(result.pages[0]!.contentHash).not.toBe(
      artifact.collection.pages[0]!.responseContentHash,
    );
  });

  it("detects content mutation without a new checksum", () => {
    expect(() =>
      validate(
        mutate((a) => {
          a.facts[2].displayText = "tampered";
        }, false),
      ),
    ).toThrow();
  });

  it.each([
    [
      "version",
      (a: any) => {
        a.artifactVersion = 2;
      },
    ],
    [
      "seed checksum",
      (a: any) => {
        a.seedSha256 = "0".repeat(64);
      },
    ],
    [
      "institution ID",
      (a: any) => {
        a.target.institutionId = "00000000-0000-4000-8000-000000000001";
      },
    ],
    [
      "unknown slug",
      (a: any) => {
        a.target.slug = "not-allowlisted";
      },
    ],
    [
      "name",
      (a: any) => {
        a.target.institutionName = "Other School";
      },
    ],
    [
      "category",
      (a: any) => {
        a.target.category = "INTERNATIONAL_SCHOOL";
      },
    ],
    [
      "source authority",
      (a: any) => {
        a.sources[0].authority = "USER_GENERATED";
      },
    ],
    [
      "source type",
      (a: any) => {
        a.sources[0].sourceType = "BLOG";
      },
    ],
    [
      "external final URL",
      (a: any) => {
        a.collection.pages[0].finalUrl = "https://other.example/";
      },
    ],
    [
      "credential URL",
      (a: any) => {
        a.sources[1].canonicalUrl = "https://user:password@www.lila.es.kr/";
      },
    ],
    [
      "private IP source",
      (a: any) => {
        a.sources[1].canonicalUrl = "http://127.0.0.1/";
      },
    ],
    [
      "invalid fact enum",
      (a: any) => {
        a.facts[0].factType = "SURPRISE";
      },
    ],
    [
      "invalid kind",
      (a: any) => {
        a.admission.kind = "SURPRISE";
      },
    ],
    [
      "invalid business state",
      (a: any) => {
        a.admission.businessState = "SURPRISE";
      },
    ],
    [
      "invalid knowledge state",
      (a: any) => {
        a.admission.knowledgeState = "SURPRISE";
      },
    ],
    [
      "invalid date",
      (a: any) => {
        a.admission.applicationOpenAt = "2026-02-30T00:00:00.000Z";
      },
    ],
    [
      "reversed dates",
      (a: any) => {
        a.admission.applicationCloseAt = "2026-01-01T00:00:00.000Z";
      },
    ],
    [
      "future collection",
      (a: any) => {
        a.collection.pages[0].collectedAt = "2027-01-01T00:00:00.000Z";
      },
    ],
    [
      "stale admission",
      (a: any) => {
        a.admission.academicYearLabel = "2025학년도";
      },
    ],
    [
      "external action URL",
      (a: any) => {
        a.admission.actionUrl = "https://other.example/";
      },
    ],
    [
      "missing admission evidence",
      (a: any) => {
        a.admission.evidenceExcerpt = "";
      },
    ],
    [
      "missing fact evidence",
      (a: any) => {
        a.facts[2].evidenceExcerpt = "";
      },
    ],
    [
      "missing page",
      (a: any) => {
        a.collection.pages.pop();
      },
    ],
    [
      "missing baseline",
      (a: any) => {
        a.facts.shift();
      },
    ],
    [
      "duplicate fact",
      (a: any) => {
        a.facts.push(a.facts[0]);
      },
    ],
    [
      "duplicate source",
      (a: any) => {
        a.sources.push(a.sources[0]);
      },
    ],
    [
      "changed excerpt hash",
      (a: any) => {
        a.collection.pages[0].evidenceText += "changed";
      },
    ],
    [
      "changed fact fingerprint",
      (a: any) => {
        a.facts[2].contentFingerprint = "0".repeat(64);
      },
    ],
    [
      "fabricated verified timestamp",
      (a: any) => {
        a.admission.verifiedAt = a.generatedAt;
      },
    ],
    [
      "failed website admission",
      (a: any) => {
        a.collection.websiteCollection = "FETCH_FAILED";
      },
    ],
  ])("rejects %s even with a recomputed artifact checksum", (_, change) => {
    expect(() => validate(mutate(change))).toThrow();
  });

  it("requires the complete 41-school allowlist", () => {
    expect(() =>
      validateBootstrapArtifact(
        sample(),
        loaded.targets.slice(0, 40),
        loaded.seedSha256,
        artifactTestTime,
      ),
    ).toThrow();
  });

  it("keeps failed website registry evidence without fabricating collection or admission", () => {
    const collection = artifactTestCollection(
      loaded.targets.find((t) => t.slug === "lila")!,
    );
    const artifact = createBootstrapArtifact(
      {
        ...collection,
        status: "SCHOOL_FETCH_FAILED",
        pages: [],
        facts: collection.facts.slice(0, 2),
        admission: null,
      },
      loaded.seedSha256,
      artifactTestTime,
    );
    expect(artifact.classification).toBe("TECHNICAL_FETCH_FAILED");
    expect(artifact.collection.pages).toHaveLength(0);
    expect(validate(artifact).admission).toBeNull();
    expect(validate(artifact).facts).toHaveLength(2);
  });
});
