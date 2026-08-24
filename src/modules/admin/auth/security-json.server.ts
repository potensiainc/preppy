import "server-only";

export type SecurityJsonLimits = Readonly<{
  maxBytes: number;
  maxDepth: number;
  maxObjectMembers: number;
  maxArrayItems: number;
  maxStringBytes: number;
}>;

export type SecurityJsonErrorCategory =
  | "invalid-syntax"
  | "duplicate-member"
  | "limit-exceeded"
  | "number-out-of-range";

const errorMessages: Record<SecurityJsonErrorCategory, string> = {
  "invalid-syntax": "Security JSON is malformed",
  "duplicate-member": "Security JSON contains a duplicate object member",
  "limit-exceeded": "Security JSON exceeds a configured limit",
  "number-out-of-range": "Security JSON contains an out-of-range number",
};

export class SecurityJsonError extends Error {
  readonly name = "SecurityJsonError";

  constructor(readonly category: SecurityJsonErrorCategory) {
    super(errorMessages[category]);
  }
}

const defaultLimits: SecurityJsonLimits = {
  maxBytes: 65_536,
  maxDepth: 20,
  maxObjectMembers: 1_000,
  maxArrayItems: 1_000,
  maxStringBytes: 16_384,
};

const hardLimits: SecurityJsonLimits = {
  maxBytes: 192 * 1024,
  maxDepth: defaultLimits.maxDepth,
  maxObjectMembers: defaultLimits.maxObjectMembers,
  maxArrayItems: defaultLimits.maxArrayItems,
  maxStringBytes: 128 * 1024,
};

type IntermediateJson =
  | null
  | boolean
  | number
  | string
  | IntermediateJson[]
  | Map<string, IntermediateJson>;

function resolveLimits(
  overrides: Partial<SecurityJsonLimits> | undefined,
): SecurityJsonLimits {
  const resolved = { ...defaultLimits };

  for (const name of Object.keys(defaultLimits) as Array<
    keyof SecurityJsonLimits
  >) {
    const override = overrides?.[name];
    if (override === undefined) continue;
    if (
      !Number.isSafeInteger(override) ||
      override < 0 ||
      override > hardLimits[name]
    ) {
      throw new RangeError(
        "Security JSON limits must be trusted bounded non-negative integers",
      );
    }
    resolved[name] = override;
  }

  return resolved;
}

function toOrdinaryJson(value: IntermediateJson): unknown {
  if (value instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, member] of value) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: toOrdinaryJson(member),
        writable: true,
      });
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(toOrdinaryJson);
  return value;
}

class SecurityJsonParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly limits: SecurityJsonLimits,
  ) {}

  parse(): unknown {
    this.skipWhitespace();
    if (this.index === this.source.length) this.fail("invalid-syntax");

    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) this.fail("invalid-syntax");

    return toOrdinaryJson(value);
  }

  private parseValue(depth: number): IntermediateJson {
    const character = this.source[this.index];

    if (character === "{") return this.parseObject(depth);
    if (character === "[") return this.parseArray(depth);
    if (character === '"') return this.parseString();
    if (character === "t") return this.parseLiteral("true", true);
    if (character === "f") return this.parseLiteral("false", false);
    if (character === "n") return this.parseLiteral("null", null);
    if (character === "-" || this.isDigit(character)) {
      return this.parseNumber();
    }

    return this.fail("invalid-syntax");
  }

  private parseObject(depth: number): Map<string, IntermediateJson> {
    this.assertContainerDepth(depth);
    this.index += 1;
    this.skipWhitespace();

    const result = new Map<string, IntermediateJson>();
    if (this.consume("}")) return result;

    while (true) {
      if (this.source[this.index] !== '"') this.fail("invalid-syntax");
      const key = this.parseString();
      if (result.has(key)) this.fail("duplicate-member");
      if (result.size >= this.limits.maxObjectMembers) {
        this.fail("limit-exceeded");
      }

      this.skipWhitespace();
      if (!this.consume(":")) this.fail("invalid-syntax");
      this.skipWhitespace();
      const value = this.parseValue(depth + 1);
      result.set(key, value);

      this.skipWhitespace();
      if (this.consume("}")) return result;
      if (!this.consume(",")) this.fail("invalid-syntax");
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): IntermediateJson[] {
    this.assertContainerDepth(depth);
    this.index += 1;
    this.skipWhitespace();

    const result: IntermediateJson[] = [];
    if (this.consume("]")) return result;

    while (true) {
      if (result.length >= this.limits.maxArrayItems) {
        this.fail("limit-exceeded");
      }
      result.push(this.parseValue(depth + 1));

      this.skipWhitespace();
      if (this.consume("]")) return result;
      if (!this.consume(",")) this.fail("invalid-syntax");
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.index += 1;
    const pieces: string[] = [];
    let bytes = 0;

    while (this.index < this.source.length) {
      const codeUnit = this.source.charCodeAt(this.index);

      if (codeUnit === 0x22) {
        this.index += 1;
        return pieces.join("");
      }
      if (codeUnit <= 0x1f) this.fail("invalid-syntax");

      let piece: string;
      let pieceBytes: number;

      if (codeUnit === 0x5c) {
        ({ piece, bytes: pieceBytes } = this.parseEscape());
      } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
        const lowSurrogate = this.source.charCodeAt(this.index + 1);
        if (lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) {
          this.fail("invalid-syntax");
        }
        piece = this.source.slice(this.index, this.index + 2);
        pieceBytes = 4;
        this.index += 2;
      } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
        return this.fail("invalid-syntax");
      } else {
        piece = this.source[this.index];
        pieceBytes = codeUnit <= 0x7f ? 1 : codeUnit <= 0x7ff ? 2 : 3;
        this.index += 1;
      }

      bytes += pieceBytes;
      if (bytes > this.limits.maxStringBytes) this.fail("limit-exceeded");
      pieces.push(piece);
    }

    return this.fail("invalid-syntax");
  }

  private parseEscape(): { piece: string; bytes: number } {
    this.index += 1;
    const escape = this.source[this.index];
    this.index += 1;

    if (escape === '"' || escape === "\\" || escape === "/") {
      return { piece: escape, bytes: 1 };
    }
    if (escape === "b") return { piece: "\b", bytes: 1 };
    if (escape === "f") return { piece: "\f", bytes: 1 };
    if (escape === "n") return { piece: "\n", bytes: 1 };
    if (escape === "r") return { piece: "\r", bytes: 1 };
    if (escape === "t") return { piece: "\t", bytes: 1 };
    if (escape !== "u") return this.fail("invalid-syntax");

    const first = this.parseHexCodeUnit();
    if (first >= 0xdc00 && first <= 0xdfff) {
      return this.fail("invalid-syntax");
    }
    if (first < 0xd800 || first > 0xdbff) {
      const piece = String.fromCharCode(first);
      return {
        piece,
        bytes: first <= 0x7f ? 1 : first <= 0x7ff ? 2 : 3,
      };
    }

    if (
      this.source[this.index] !== "\\" ||
      this.source[this.index + 1] !== "u"
    ) {
      return this.fail("invalid-syntax");
    }
    this.index += 2;
    const second = this.parseHexCodeUnit();
    if (second < 0xdc00 || second > 0xdfff) {
      return this.fail("invalid-syntax");
    }

    const codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
    return { piece: String.fromCodePoint(codePoint), bytes: 4 };
  }

  private parseHexCodeUnit(): number {
    let value = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      const codeUnit = this.source.charCodeAt(this.index);
      let digit: number;
      if (codeUnit >= 0x30 && codeUnit <= 0x39) digit = codeUnit - 0x30;
      else if (codeUnit >= 0x41 && codeUnit <= 0x46) digit = codeUnit - 0x37;
      else if (codeUnit >= 0x61 && codeUnit <= 0x66) digit = codeUnit - 0x57;
      else return this.fail("invalid-syntax");
      value = value * 16 + digit;
      this.index += 1;
    }
    return value;
  }

  private parseNumber(): number {
    const start = this.index;

    this.consume("-");
    if (this.consume("0")) {
      if (this.isDigit(this.source[this.index])) this.fail("invalid-syntax");
    } else {
      if (!this.isNonZeroDigit(this.source[this.index])) {
        return this.fail("invalid-syntax");
      }
      this.index += 1;
      while (this.isDigit(this.source[this.index])) this.index += 1;
    }

    if (this.consume(".")) {
      if (!this.isDigit(this.source[this.index])) {
        return this.fail("invalid-syntax");
      }
      while (this.isDigit(this.source[this.index])) this.index += 1;
    }

    if (this.source[this.index] === "e" || this.source[this.index] === "E") {
      this.index += 1;
      if (this.source[this.index] === "+" || this.source[this.index] === "-") {
        this.index += 1;
      }
      if (!this.isDigit(this.source[this.index])) {
        return this.fail("invalid-syntax");
      }
      while (this.isDigit(this.source[this.index])) this.index += 1;
    }

    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) this.fail("number-out-of-range");
    return value;
  }

  private parseLiteral<T extends null | boolean>(token: string, value: T): T {
    if (!this.source.startsWith(token, this.index)) {
      return this.fail("invalid-syntax");
    }
    this.index += token.length;
    return value;
  }

  private assertContainerDepth(depth: number): void {
    if (depth >= this.limits.maxDepth) this.fail("limit-exceeded");
  }

  private skipWhitespace(): void {
    while (
      this.source[this.index] === " " ||
      this.source[this.index] === "\t" ||
      this.source[this.index] === "\r" ||
      this.source[this.index] === "\n"
    ) {
      this.index += 1;
    }
  }

  private consume(expected: string): boolean {
    if (this.source[this.index] !== expected) return false;
    this.index += 1;
    return true;
  }

  private isDigit(value: string | undefined): boolean {
    return value !== undefined && value >= "0" && value <= "9";
  }

  private isNonZeroDigit(value: string | undefined): boolean {
    return value !== undefined && value >= "1" && value <= "9";
  }

  private fail(category: SecurityJsonErrorCategory): never {
    throw new SecurityJsonError(category);
  }
}

export function parseSecurityJson(
  text: string,
  limits?: Partial<SecurityJsonLimits>,
): unknown {
  const resolvedLimits = resolveLimits(limits);
  if (new TextEncoder().encode(text).byteLength > resolvedLimits.maxBytes) {
    throw new SecurityJsonError("limit-exceeded");
  }
  return new SecurityJsonParser(text, resolvedLimits).parse();
}
