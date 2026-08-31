import { PROVISIONAL_ADMISSION_NOTICE } from "@/src/modules/live-admissions/guidance";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";
import { safeExternalHref } from "./presentation";

export type AdmissionSection = {
  id: string;
  heading: string | null;
  paragraphs: string[];
};

export function admissionNoticeText(summary: string | null): string {
  return (
    (publicAdmissionText(summary) ?? "")
      .split(/\n\s*\n/u)
      .map((block) => block.trim())
      .find((block) => /^예정 안내 · 변경 가능:[^\n]+$/u.test(block)) ??
    PROVISIONAL_ADMISSION_NOTICE
  );
}

/** Parse parent-facing copy, keeping stored source evidence unchanged. */
export function admissionSections(
  summary: string | null,
  prefix: string,
  omitProvisional = false,
): AdmissionSection[] {
  const sections: AdmissionSection[] = [];
  const omittedNotice = omitProvisional ? admissionNoticeText(summary) : null;
  let section: AdmissionSection = {
    id: `${prefix}-1`,
    heading: null,
    paragraphs: [],
  };
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    if (text && text !== omittedNotice) section.paragraphs.push(text);
    paragraph = [];
  };
  const flushSection = () => {
    flushParagraph();
    if (section.paragraphs.length) sections.push(section);
  };
  for (const line of (publicAdmissionText(summary) ?? "").split("\n")) {
    const heading = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
    if (heading) {
      flushSection();
      section = {
        id: `${prefix}-${sections.length + 1}`,
        heading: heading[1]!,
        paragraphs: [],
      };
    } else if (!line.trim()) flushParagraph();
    else paragraph.push(line);
  }
  flushSection();
  return sections;
}

/** Only clearly non-warning domains may collapse on institution overviews. */
export function canCollapseAdmissionSection(
  section: AdmissionSection,
): boolean {
  return (
    section.heading !== null &&
    /^(?:지원\s*(?:대상|조건|자격|방법).*|모집\s*인원.*|제출\s*서류.*|수업료.*|교육비.*)$/u.test(
      section.heading,
    ) &&
    !/확인|주의|유의|경고|충돌|불일치|취소|예외|원문|출처|변경|미확인|포기/u.test(
      [section.heading, ...section.paragraphs].join(" "),
    )
  );
}

export function admissionClock(value: string): string | null {
  const local =
    /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/u.exec(value);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  if (local) {
    const hour = Number(local[1]);
    return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${local[2]} · 현지 시각`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", hour12: true }).format(date)} KST`;
}

export function admissionSourceType(url: string): string {
  const safe = safeExternalHref(url);
  if (!safe) return "공식 자료";
  return "학교 공식 안내";
}

export function admissionTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date)} KST`;
}
