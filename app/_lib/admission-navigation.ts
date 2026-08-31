import type {
  OpportunityKeyDatesDTO,
  PublicOpportunityDTO,
  ReviewedAdmissionDTO,
} from "@/src/modules/public/dto";

const canonicalGuide =
  /^live-admissions-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(?:20\d{2}|current)$/u;

export function admissionSessionAnchor(slug: string): string {
  return `session-${slug}`;
}

/** Without an end time, only a previous calendar day is classified as past.
 * Registration CLOSED is deliberately irrelevant to the event's chronology. */
export function isPastAdmissionDate(
  dates: OpportunityKeyDatesDTO,
  now = new Date(),
): boolean {
  const end = dates.eventEndsAt;
  if (end && /(?:Z|[+-]\d{2}:\d{2})$/u.test(end)) {
    const timestamp = Date.parse(end);
    return Number.isFinite(timestamp) && timestamp < now.getTime();
  }
  const value = end ?? dates.eventStartsAt;
  if (!value) return false;
  // Unqualified local timestamps have no reliable timezone: leave them unclassified.
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  )
    return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return calendar.format(parsed) < calendar.format(now);
}

/** Identity, not title/year similarity, determines membership. */
export function isAdmissionChild(
  parentSlug: string,
  childSlug: string,
): boolean {
  return (
    canonicalGuide.test(parentSlug) &&
    childSlug.startsWith(`${parentSlug}-event-`) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(childSlug.slice(parentSlug.length + 7))
  );
}

export function unifiedAdmissionDestination(
  opportunity: PublicOpportunityDTO,
): string | null {
  const guide = opportunity.admissionGuide;
  if (
    !guide ||
    !isAdmissionChild(guide.slug, opportunity.slug) ||
    !guide.slug.startsWith(`live-admissions-${opportunity.institution.id}-`) ||
    !opportunity.relatedAdmissions?.some(
      (item) => item.slug === opportunity.slug,
    )
  )
    return null;
  return `/opportunities/${guide.slug}#${admissionSessionAnchor(opportunity.slug)}`;
}

export function groupReviewedAdmissions(admissions: ReviewedAdmissionDTO[]) {
  const parents = admissions.filter(
    (item) =>
      canonicalGuide.test(item.slug) &&
      (item.kind === "RECRUITMENT" || item.kind === "LOTTERY"),
  );
  const children = new Set<string>();
  const groups = parents.map((guide) => {
    const sessions = admissions.filter((item) =>
      isAdmissionChild(guide.slug, item.slug),
    );
    sessions.forEach((item) => children.add(item.slug));
    return { guide, sessions };
  });
  const all = [
    ...groups,
    ...admissions
      .filter((item) => !parents.includes(item) && !children.has(item.slug))
      .map((guide) => ({ guide, sessions: [] as ReviewedAdmissionDTO[] })),
  ];
  const primary = (item: ReviewedAdmissionDTO) =>
    parents.includes(item) ||
    item.kind === "RECRUITMENT" ||
    item.kind === "ADDITIONAL_RECRUITMENT";
  return all.sort(
    (a, b) =>
      Number(primary(b.guide)) - Number(primary(a.guide)) ||
      admissions.indexOf(a.guide) - admissions.indexOf(b.guide),
  );
}
