import { describe, expect, it } from "vitest";

import {
  DEFAULT_HTTP_COLLECTOR_POLICY,
  parseHttpCollectorPolicy,
} from "@/src/modules/http-collector/contracts";
import { classifyCandidate } from "@/src/modules/http-collector/classification";
import {
  discoveryDomainKey,
  isSameDiscoveryDomain,
  normalizeDiscoveryUrl,
  parseCollectorUrl,
} from "@/src/modules/http-collector/url-policy";

describe("HTTP collector bounded policy", () => {
  it("provides the approved immutable conservative defaults", () => {
    expect(DEFAULT_HTTP_COLLECTOR_POLICY).toEqual({
      maxDepth: 2,
      maxPagesPerInstitution: 30,
      maxLinksPerPage: 250,
      maxResponseBytesPerPage: 2 * 1024 * 1024,
      maxTotalBytesPerRun: 20 * 1024 * 1024,
      requestTimeoutMs: 10_000,
      connectTimeoutMs: 5_000,
      maxRedirects: 5,
      perHostConcurrency: 1,
      globalConcurrency: 4,
      minimumHostDelayMs: 500,
      robotsMaxResponseBytes: 512 * 1024,
    });
    expect(Object.isFrozen(DEFAULT_HTTP_COLLECTOR_POLICY)).toBe(true);
  });

  it.each([
    ["maxDepth", 3],
    ["maxPagesPerInstitution", 31],
    ["maxLinksPerPage", 251],
    ["maxResponseBytesPerPage", 2 * 1024 * 1024 + 1],
    ["maxTotalBytesPerRun", 20 * 1024 * 1024 + 1],
    ["requestTimeoutMs", 30_001],
    ["connectTimeoutMs", 30_001],
    ["maxRedirects", 6],
    ["perHostConcurrency", 2],
    ["globalConcurrency", 5],
    ["minimumHostDelayMs", 5_001],
    ["robotsMaxResponseBytes", 512 * 1024 + 1],
  ] as const)("rejects an unapproved %s upper bound", (key, value) => {
    expect(() => parseHttpCollectorPolicy({ [key]: value })).toThrow();
  });

  it("accepts a smaller finite crawl policy and freezes the result", () => {
    const policy = parseHttpCollectorPolicy({
      maxDepth: 1,
      maxPagesPerInstitution: 3,
      maxLinksPerPage: 10,
      globalConcurrency: 2,
      minimumHostDelayMs: 0,
    });
    expect(policy).toMatchObject({
      maxDepth: 1,
      maxPagesPerInstitution: 3,
      maxLinksPerPage: 10,
      globalConcurrency: 2,
      minimumHostDelayMs: 0,
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });
});

describe("HTTP collector URL and exact-domain policy", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://school.kr/file",
    "data:text/plain,secret",
    "https://user:password@school.kr/",
    "javascript:alert(1)",
  ])("rejects unsafe collector URL %s", (url) => {
    expect(() => parseCollectorUrl(url)).toThrowError(
      expect.objectContaining({ code: "INVALID_URL" }),
    );
  });

  it("removes fragments and normalizes URL syntax without rewriting query order or trailing slash", () => {
    expect(
      normalizeDiscoveryUrl(
        "HTTPS://WWW.School.KR:443/a/../notice?b=2&a=1#section",
      ),
    ).toBe("https://www.school.kr/notice?b=2&a=1");
    expect(normalizeDiscoveryUrl("https://school.kr/notice/")).toBe(
      "https://school.kr/notice/",
    );
    expect(normalizeDiscoveryUrl("https://school.kr/notice")).toBe(
      "https://school.kr/notice",
    );
  });

  it("removes one leading www for discovery equality but isolates other subdomains", () => {
    expect(discoveryDomainKey("https://WWW.School.KR/")).toBe("school.kr");
    expect(
      isSameDiscoveryDomain("https://www.school.kr/", "https://school.kr/a"),
    ).toBe(true);
    expect(
      isSameDiscoveryDomain(
        "https://school.kr/",
        "https://admission.school.kr/",
      ),
    ).toBe(false);
    expect(discoveryDomainKey("https://www.www.school.kr/")).toBe(
      "www.school.kr",
    );
  });
});

describe("candidate classification hints", () => {
  it.each([
    ["https://school.kr/입학안내", "모집요강", "ADMISSIONS"],
    ["https://school.kr/apply", "Apply now", "APPLICATION"],
    ["https://school.kr/fees", "Tuition and Fees", "TUITION"],
    ["https://school.kr/program", "교육과정", "CURRICULUM"],
    ["https://school.kr/news", "공지사항", "NOTICE"],
    ["https://school.kr/events", "Open House", "OPEN_HOUSE"],
    ["https://school.kr/about/contact", "연락처", "CONTACT"],
    ["https://school.kr/about", "School history", "OTHER"],
  ] as const)("classifies %s / %s as %s", (url, anchorText, expected) => {
    expect(classifyCandidate({ url, anchorText })).toBe(expected);
  });
});
