import { load } from "cheerio";

import { normalizeVisibleText } from "@/src/modules/http-collector/html";

import type {
  LiveAdmissionExtractionInput,
  LiveAdmissionKnowledgeState,
  LiveAdmissionProposal,
} from "./contracts";

const MAX_EVIDENCE_EXCERPT = 2_000;
const ACADEMIC_YEAR = /(20\d{2})\s*학년도/gu;
const ADMISSION_WORD =
  /입학|신입생|모집|원서|admission|application|open\s*house/iu;
const APPLICATION_WORD =
  /원서\s*접수|접수\s*기간|지원\s*기간|application(?:\s+period|\s+window)?/iu;
const EVENT_WORD = /입학\s*설명회|설명회|오픈\s*하우스|open\s*house/iu;
const AUDIENCE_WORD =
  /지원\s*(?:자격|대상)|입학\s*자격|모집\s*대상|적령\s*아동|취학의무|조기입학|eligible|eligibility|applicant/iu;
const EXPLICIT_NOT_ANNOUNCED =
  /(?:(?:추후|향후|별도).{0,24}(?:공지|안내|발표)|(?:일정|날짜).{0,16}(?:미정|미발표)|아직.{0,24}(?:공지|안내|발표))/iu;

const KOREAN_DATE =
  /(?:(20\d{2})\s*(?:년|[./-])\s*)?(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*(?:일|\.)?\s*(?:\([^)]{1,8}\))?(?:\s*(오전|오후)?\s*(\d{1,2})(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분?)?))?/gu;

type ParsedDate = Readonly<{ value: Date; explicitTime: boolean }>;

function decodedHtml(value: string | Uint8Array): string {
  return typeof value === "string"
    ? value
    : new TextDecoder("utf-8", { fatal: false }).decode(value);
}

function sourceBlocks(html: string): Readonly<{
  title: string;
  headings: readonly string[];
  blocks: readonly string[];
  visibleText: string;
}> {
  const $ = load(html);
  $("script, style, noscript, template").remove();
  const title = normalizeVisibleText($("title").first().text());
  const headings = $("h1, h2, h3")
    .toArray()
    .map((element) => normalizeVisibleText($(element).text()))
    .filter(Boolean);
  const candidates = $("h1, h2, h3, p, li, tr, a")
    .toArray()
    .map((element) => normalizeVisibleText($(element).text()))
    .filter(Boolean);
  const blocks = [...new Set([title, ...candidates].filter(Boolean))];
  const visibleText = normalizeVisibleText($.root().text());
  return Object.freeze({
    title,
    headings: Object.freeze(headings),
    blocks: Object.freeze(blocks),
    visibleText,
  });
}

function parseKoreanDates(value: string): ParsedDate[] {
  const results: ParsedDate[] = [];
  let inheritedYear: number | null = null;
  for (const match of value.matchAll(KOREAN_DATE)) {
    if (match[1] !== undefined) inheritedYear = Number(match[1]);
    if (inheritedYear === null) continue;
    const year = inheritedYear;
    const month = Number(match[2]);
    const day = Number(match[3]);
    const ampm = match[4];
    const rawHour = match[5] === undefined ? 0 : Number(match[5]);
    const minute = Number(match[6] ?? match[7] ?? 0);
    const explicitTime = match[5] !== undefined;
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      rawHour < 0 ||
      rawHour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      continue;
    }
    let hour = rawHour;
    if (ampm === "오전" && hour === 12) hour = 0;
    if (ampm === "오후" && hour < 12) hour += 12;
    const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
    if (
      date.getUTCFullYear() !== year &&
      // Midnight KST belongs to the previous UTC date; validate through a
      // round-trip shifted into KST instead of comparing raw UTC parts.
      hour !== 0
    ) {
      continue;
    }
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
    if (
      kst.getUTCFullYear() !== year ||
      kst.getUTCMonth() !== month - 1 ||
      kst.getUTCDate() !== day ||
      kst.getUTCHours() !== hour ||
      kst.getUTCMinutes() !== minute
    ) {
      continue;
    }
    results.push(Object.freeze({ value: date, explicitTime }));
  }
  return results;
}

function firstBlockForAcademicYear(
  blocks: readonly string[],
  pattern: RegExp,
  academicYearLabel: string | null,
): string | null {
  const matching = blocks.filter((block) => pattern.test(block));
  return (
    matching.find(
      (block) =>
        academicYearLabel !== null && block.includes(academicYearLabel),
    ) ??
    matching[0] ??
    null
  );
}

function firstDatedBlock(
  blocks: readonly string[],
  pattern: RegExp,
  academicYearLabel?: string | null,
): string | null {
  const matching = blocks.filter((block) => pattern.test(block));
  return (
    matching.find(
      (block) =>
        academicYearLabel !== null &&
        academicYearLabel !== undefined &&
        block.includes(academicYearLabel) &&
        parseKoreanDates(block).length > 0,
    ) ??
    matching.find((block) => parseKoreanDates(block).length > 0) ??
    matching[0] ??
    null
  );
}

function latestAcademicYear(values: readonly string[]): string | null {
  return (
    [...new Set(values)].sort(
      (left, right) => Number(right.slice(0, 4)) - Number(left.slice(0, 4)),
    )[0] ?? null
  );
}

function blocksForSelectedAdmissionYear(
  document: ReturnType<typeof sourceBlocks>,
  academicYearLabel: string | null,
): readonly string[] {
  if (academicYearLabel === null) return document.blocks;
  const headings = new Set([document.title, ...document.headings]);
  let sectionYear: string | null = null;
  return document.blocks.filter((block) => {
    // A different school's level cannot establish this elementary cycle's context.
    if (/중학교/iu.test(block)) return false;
    const years = [
      ...new Set(
        [...block.matchAll(ACADEMIC_YEAR)].map((match) => `${match[1]}학년도`),
      ),
    ];
    if (
      years.length === 1 &&
      (headings.has(block) || ADMISSION_WORD.test(block))
    ) {
      sectionYear = years[0]!;
    }
    return (
      (sectionYear === null || sectionYear === academicYearLabel) &&
      years.every((year) => year === academicYearLabel)
    );
  });
}

function bounded(value: string): string {
  return value.slice(0, MAX_EVIDENCE_EXCERPT);
}

export function deriveLiveAdmissionBusinessState(
  referenceTime: Date,
  applicationOpenAt: Date | null,
  applicationCloseAt: Date | null,
  eventStartAt: Date | null,
): LiveAdmissionProposal["businessState"] {
  const now = referenceTime.getTime();
  if (
    applicationOpenAt !== null &&
    applicationCloseAt !== null &&
    now >= applicationOpenAt.getTime() &&
    now <= applicationCloseAt.getTime()
  ) {
    return "OPEN";
  }
  if (applicationCloseAt !== null && now > applicationCloseAt.getTime()) {
    return "CLOSED";
  }
  if (
    (applicationOpenAt !== null && now < applicationOpenAt.getTime()) ||
    (eventStartAt !== null && now < eventStartAt.getTime())
  ) {
    return "UPCOMING";
  }
  return "UNKNOWN";
}

function scheduleTitle(
  pageTitle: string,
  headings: readonly string[],
  academicYearLabel: string | null,
): string {
  const candidate = [pageTitle, ...headings].find(
    (value) =>
      value &&
      ADMISSION_WORD.test(value) &&
      (academicYearLabel === null || value.includes(academicYearLabel)),
  );
  if (candidate) return candidate.slice(0, 500);
  const fallback = [pageTitle, ...headings].find(
    (value) => value && ADMISSION_WORD.test(value),
  );
  if (fallback) return fallback.slice(0, 500);
  return `${academicYearLabel ? `${academicYearLabel} ` : ""}입학 안내`;
}

export function extractLiveAdmissionProposal(
  input: LiveAdmissionExtractionInput,
): LiveAdmissionProposal {
  if (!Number.isFinite(input.referenceTime.getTime())) {
    throw new RangeError("referenceTime must be valid");
  }
  const document = sourceBlocks(decodedHtml(input.html));
  const warnings: string[] = [];
  const years = [...document.visibleText.matchAll(ACADEMIC_YEAR)].map(
    (match) => `${match[1]}학년도`,
  );
  const admissionYears = document.blocks
    .filter((block) => ADMISSION_WORD.test(block) && !/중학교/iu.test(block))
    .flatMap((block) =>
      [...block.matchAll(ACADEMIC_YEAR)].map((match) => `${match[1]}학년도`),
    );
  // A curriculum/news year alone is not an admission cycle.
  const academicYearLabel = latestAcademicYear(admissionYears);
  if (!years.includes(input.targetAcademicYearLabel)) {
    warnings.push("TARGET_ACADEMIC_YEAR_NOT_FOUND");
  }

  const cycleBlocks = blocksForSelectedAdmissionYear(
    document,
    academicYearLabel,
  );
  const applicationBlock = firstDatedBlock(
    cycleBlocks,
    APPLICATION_WORD,
    academicYearLabel,
  );
  const applicationDates = applicationBlock
    ? parseKoreanDates(applicationBlock)
    : [];
  let applicationOpenAt: Date | null = applicationDates[0]?.value ?? null;
  let applicationCloseAt: Date | null = applicationDates[1]?.value ?? null;
  if (
    applicationOpenAt !== null &&
    applicationCloseAt !== null &&
    applicationCloseAt.getTime() < applicationOpenAt.getTime()
  ) {
    applicationOpenAt = null;
    applicationCloseAt = null;
    warnings.push("INVALID_APPLICATION_DATE_RANGE");
  }

  const eventBlock = firstDatedBlock(
    cycleBlocks,
    EVENT_WORD,
    academicYearLabel,
  );
  const eventStartAt = eventBlock
    ? (parseKoreanDates(eventBlock)[0]?.value ?? null)
    : null;
  const targetAudience = firstBlockForAcademicYear(
    cycleBlocks,
    AUDIENCE_WORD,
    academicYearLabel,
  );
  const explicitNotAnnounced = cycleBlocks.find(
    (block) => ADMISSION_WORD.test(block) && EXPLICIT_NOT_ANNOUNCED.test(block),
  );
  const hasSchedule =
    applicationOpenAt !== null ||
    applicationCloseAt !== null ||
    eventStartAt !== null;
  const knowledgeState: LiveAdmissionKnowledgeState = hasSchedule
    ? "SCHEDULE_FOUND"
    : explicitNotAnnounced
      ? "NOT_ANNOUNCED"
      : "NOT_FOUND";
  const relevantBlocks = cycleBlocks.filter(
    (block) =>
      ADMISSION_WORD.test(block) ||
      APPLICATION_WORD.test(block) ||
      EVENT_WORD.test(block) ||
      AUDIENCE_WORD.test(block),
  );
  const evidenceExcerpt = bounded(
    (relevantBlocks.length > 0 ? relevantBlocks : [document.visibleText]).join(
      " | ",
    ),
  );
  const title =
    knowledgeState === "SCHEDULE_FOUND"
      ? scheduleTitle(document.title, document.headings, academicYearLabel)
      : knowledgeState === "NOT_ANNOUNCED"
        ? `${academicYearLabel ? `${academicYearLabel} ` : ""}입학 일정 미발표`
        : "입학 관련 정보 미발견";
  const kind: LiveAdmissionProposal["kind"] =
    applicationOpenAt !== null || applicationCloseAt !== null
      ? "RECRUITMENT"
      : eventStartAt !== null
        ? input.classificationHint === "OPEN_HOUSE"
          ? "OPEN_HOUSE"
          : "INFORMATION_SESSION"
        : "OTHER";
  const summary =
    knowledgeState === "NOT_FOUND"
      ? null
      : bounded(
          [applicationBlock, eventBlock, explicitNotAnnounced]
            .filter((value): value is string => value !== null)
            .filter((value, index, values) => values.indexOf(value) === index)
            .join(" | "),
        ) || null;
  return Object.freeze({
    academicYearLabel,
    knowledgeState,
    kind,
    businessState: hasSchedule
      ? deriveLiveAdmissionBusinessState(
          input.referenceTime,
          applicationOpenAt,
          applicationCloseAt,
          eventStartAt,
        )
      : "UNKNOWN",
    title,
    summary,
    targetAudience,
    eventStartAt,
    eventEndAt: null,
    applicationOpenAt,
    applicationCloseAt,
    actionUrl: input.sourceUrl,
    evidenceExcerpt,
    warnings: Object.freeze(warnings),
  });
}
