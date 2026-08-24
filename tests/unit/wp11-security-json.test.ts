import { describe, expect, it } from "vitest";

import {
  parseSecurityJson,
  SecurityJsonError,
} from "@/src/modules/admin/auth/security-json.server";

function expectSecurityJsonError(
  source: string,
  category:
    | "invalid-syntax"
    | "duplicate-member"
    | "limit-exceeded"
    | "number-out-of-range",
): void {
  try {
    parseSecurityJson(source);
    throw new Error("Expected parseSecurityJson to reject the fixture");
  } catch (error) {
    expect(error).toBeInstanceOf(SecurityJsonError);
    expect(error).toMatchObject({ category });
  }
}

describe("security JSON object member handling", () => {
  it.each([
    ["root object", '{"alg":"RS256","alg":"none"}'],
    ["nested object", '{"outer":{"kid":"one","kid":"two"}}'],
    ["object in an array", '{"keys":[{"kid":"one","kid":"two"}]}'],
    ["decoded-equivalent key", '{"alg":"RS256","\\u0061lg":"none"}'],
  ])("rejects duplicate decoded members in a %s", (_case, source) => {
    expectSecurityJsonError(source, "duplicate-member");
  });

  it("preserves ordinary JSON values and unknown semantic members", () => {
    expect(
      parseSecurityJson(
        '{"keys":[{"kid":"one","unknown_extension":{"enabled":true}}],"count":2,"ratio":-1.25e2,"empty":null,"label":"OIDC \\uD83D\\uDD10"}',
      ),
    ).toEqual({
      keys: [{ kid: "one", unknown_extension: { enabled: true } }],
      count: 2,
      ratio: -125,
      empty: null,
      label: "OIDC 🔐",
    });
  });

  it("returns safe ordinary objects while preserving prototype-named members", () => {
    const parsed = parseSecurityJson(
      '{"__proto__":{"polluted":true},"constructor":"extension"}',
    ) as Record<string, unknown>;

    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(parsed["__proto__"]).toEqual({ polluted: true });
    expect(parsed.constructor).toBe("extension");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("security JSON syntax", () => {
  it.each([
    ["empty input", ""],
    ["whitespace-only input", " \t\r\n "],
    ["trailing data", '{"kid":"one"} trailing'],
    ["invalid escape", '"\\x20"'],
    ["unpaired escaped high surrogate", '"\\uD800"'],
    ["unpaired escaped low surrogate", '"\\uDC00"'],
    ["unpaired raw high surrogate", `"${String.fromCharCode(0xd800)}"`],
    ["unpaired raw low surrogate", `"${String.fromCharCode(0xdc00)}"`],
    ["leading zero", "01"],
    ["missing integer", "-"],
    ["missing fraction", "1."],
    ["missing exponent", "1e"],
    ["leading plus", "+1"],
  ])("rejects %s", (_case, source) => {
    expectSecurityJsonError(source, "invalid-syntax");
  });

  it("rejects an unescaped control character", () => {
    expectSecurityJsonError('"line\nbreak"', "invalid-syntax");
  });

  it("rejects a finite-grammar number that overflows JavaScript number semantics", () => {
    expectSecurityJsonError("1e400", "number-out-of-range");
    expect(parseSecurityJson("1e308")).toBe(1e308);
  });

  it("does not echo source JSON in deterministic errors", () => {
    const source = '{"client_secret":"never-echo-this","client_secret":0}';
    const errors = [source, source].map((fixture) => {
      try {
        parseSecurityJson(fixture);
        throw new Error("Expected duplicate-member rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityJsonError);
        return error as SecurityJsonError;
      }
    });

    expect(errors[0].category).toBe("duplicate-member");
    expect(errors[1].category).toBe("duplicate-member");
    expect(errors[0].message).toBe(errors[1].message);
    expect(errors[0].message).not.toContain("never-echo-this");
    expect(errors[0].message).not.toContain("client_secret");
  });
});

describe("security JSON bounds", () => {
  it("enforces the UTF-8 byte limit", () => {
    expect(parseSecurityJson('"é"', { maxBytes: 4 })).toBe("é");

    expect(() => parseSecurityJson('"é"', { maxBytes: 3 })).toThrow(
      SecurityJsonError,
    );
  });

  it("allows depth 20 and rejects depth 21", () => {
    const depth20 = `${"[".repeat(20)}null${"]".repeat(20)}`;
    const depth21 = `[${depth20}]`;

    expect(parseSecurityJson(depth20)).toEqual([
      [[[[[[[[[[[[[[[[[[[null]]]]]]]]]]]]]]]]]]],
    ]);
    expect(() => parseSecurityJson(depth21)).toThrow(SecurityJsonError);
  });

  it("allows 1,000 members per object and rejects the 1,001st", () => {
    const nearLimit = `{${Array.from(
      { length: 1_000 },
      (_, index) => `"member${index}":${index}`,
    ).join(",")}}`;
    const overLimit = `${nearLimit.slice(0, -1)},"overflow":1000}`;

    const parsed = parseSecurityJson(nearLimit) as Record<string, unknown>;
    expect(Object.keys(parsed)).toHaveLength(1_000);
    expect(parsed.member0).toBe(0);
    expect(parsed.member999).toBe(999);
    expect(() => parseSecurityJson(overLimit)).toThrow(SecurityJsonError);
  });

  it("allows 1,000 array items and rejects the 1,001st", () => {
    const nearLimit = `[${Array.from({ length: 1_000 }, (_, index) =>
      String(index),
    ).join(",")}]`;
    const overLimit = `${nearLimit.slice(0, -1)},1000]`;

    const parsed = parseSecurityJson(nearLimit) as unknown[];
    expect(parsed).toHaveLength(1_000);
    expect(parsed[0]).toBe(0);
    expect(parsed[999]).toBe(999);
    expect(() => parseSecurityJson(overLimit)).toThrow(SecurityJsonError);
  });

  it("allows 16,384 decoded UTF-8 string bytes and rejects one more", () => {
    expect(parseSecurityJson(`"${"a".repeat(16_384)}"`)).toBe(
      "a".repeat(16_384),
    );
    expect(() => parseSecurityJson(`"${"a".repeat(16_385)}"`)).toThrow(
      SecurityJsonError,
    );
  });

  it("honors stricter per-call container limits", () => {
    expect(() =>
      parseSecurityJson('{"one":1,"two":2}', { maxObjectMembers: 1 }),
    ).toThrow(SecurityJsonError);
    expect(() => parseSecurityJson("[1,2]", { maxArrayItems: 1 })).toThrow(
      SecurityJsonError,
    );
    expect(() => parseSecurityJson('"ab"', { maxStringBytes: 1 })).toThrow(
      SecurityJsonError,
    );
    expect(() => parseSecurityJson("[[null]]", { maxDepth: 1 })).toThrow(
      SecurityJsonError,
    );
  });
});
