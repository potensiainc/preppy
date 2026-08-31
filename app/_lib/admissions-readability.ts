import type { AdmissionSection } from "./admissions-presentation";
import { publicAdmissionText } from "@/src/modules/public/admission-copy";

type Topic =
  | "지원 대상"
  | "지원 자격"
  | "지원 가능 지역"
  | "모집 인원"
  | "제출 서류"
  | "원서접수"
  | "설명회"
  | "추첨"
  | "결과 발표"
  | "등록"
  | "쌍둥이 지원"
  | "대기자·결원 충원"
  | "교육비"
  | "납부 금액·방법"
  | "통학"
  | "유의사항"
  | "문의";

export type AdmissionReadingGroup = {
  heading: string | null;
  paragraphs: string[];
  context: string[];
};

/** Layout boundaries only: retain dates, punctuation inside URLs, quoted
 * conditions and parenthetical qualifications. Never extract new DB values. */
export function admissionReadingItems(text: string): string[] {
  const items: string[] = [];
  const closes: string[] = [];
  const pairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "“": "”",
    "‘": "’",
    '"': '"',
  };
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (closes.at(-1) === char) closes.pop();
    else if (pairs[char]) closes.push(pairs[char]!);
    if (closes.length) continue;
    const token =
      text
        .slice(start, i + 1)
        .split(/\s/u)
        .at(-1) ?? "";
    const url = /https?:\/\//u.test(token);
    const separator = /[;；]/u.test(char) && !url;
    const sentence =
      /[.!?]/u.test(char) &&
      !url &&
      /[가-힣”’)]/u.test(text[i - 1] ?? "") &&
      /\s/u.test(text[i + 1] ?? "");
    if (separator || sentence || char === "\n") {
      const item = text.slice(start, separator ? i : i + 1).trim();
      if (item) items.push(item);
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

export function admissionAudienceRows(
  value: string | null,
): { label: string; value: string }[] {
  const text = publicAdmissionText(value);
  if (!text) return [];
  return admissionReadingItems(text)
    .flatMap((item) => item.split(/[,，]\s*(?=(?:유예|조기입학|취학|미취학))/u))
    .map((item) => ({
      label: /출생|년생|학년|연령|만\s*\d+\s*세/u.test(item)
        ? "지원 대상"
        : /\d+\s*(?:명|학급)|(?:일반|특별)\s*\d+/u.test(item)
          ? "모집 인원"
          : /서울|경기|수도권|거주|통학|지역/u.test(item)
            ? "지원 가능 지역"
            : /자격|유예|조기입학|미취학|국적|조건/u.test(item)
              ? "지원 자격"
              : "지원 대상",
      value: item,
    }));
}

const headingRules: [Topic, RegExp][] = [
  ["지원 대상", /대상/u],
  ["지원 자격", /자격|조건/u],
  ["지원 가능 지역", /지역/u],
  ["모집 인원", /인원/u],
  ["제출 서류", /서류|증빙/u],
  ["원서접수", /접수/u],
  ["설명회", /설명회/u],
  ["추첨", /추첨/u],
  ["결과 발표", /발표/u],
  ["등록", /등록/u],
  ["쌍둥이 지원", /쌍둥이|다둥이/u],
  ["대기자·결원 충원", /대기|결원|후보자/u],
  ["교육비", /교육비|수업료|급식|비용/u],
  ["납부 금액·방법", /납부|입학금|전형료/u],
  ["통학", /통학|교통/u],
  ["유의사항", /유의|주의/u],
  ["문의", /문의/u],
];

function sentenceTopic(
  text: string,
  previous: Topic | null,
  fallback: Topic,
): Topic {
  // Conditional follow-up sentences keep the established population. A mention
  // of "추첨", "등록" or a number alone must not make a twins/waitlist rule general.
  if (
    (previous === "쌍둥이 지원" || previous === "대기자·결원 충원") &&
    /^(?:1회\s*추첨에서\s*대표|\d+(?:\.\d+)?%를\s*초과|범위|이를|그(?:\s|기간|인원)|부재\s*시|대표|낙첨|미달|본\s?추첨|정원 외|각자|개별 방식|동반|기회를 받은|포기자는|명부는|재학생 형제자매는|해당 학년도)/u.test(
      text,
    ) &&
    !/대기|결원|예비당첨|예비명부|쌍둥이|다둥이/u.test(text)
  )
    return previous;
  if (/신중하게 고려|허위 사실|유의하|주의하/u.test(text)) return "유의사항";
  if (
    /^(?:지원 대상이 아니|허위|이 안내|이 요강|공식 원문|원문 제목)/u.test(text)
  )
    return "유의사항";
  if (
    /^(?:문의|학교 주소|학교 위치|교무실 \d|행정실 \d)|문의는 (?:교무실|행정실)/u.test(
      text,
    )
  )
    return "문의";
  if (
    /서류|증빙|동의서|접수증|확인서 사본|등본|증명서|사진\s*파일|사진파일|수험표/u.test(
      text,
    ) &&
    !/입학포기서/u.test(text)
  )
    return "제출 서류";
  if (/대기|예비당첨|예비명부|결원|후보자/u.test(text))
    return "대기자·결원 충원";
  if (/쌍둥이|다둥이|동반 추첨|동반 1회|대표 추첨|대표 당첨/u.test(text))
    return "쌍둥이 지원";
  if (/^(?:미달이면 전원|정원 미달이면|모집 미달이면 전원)/u.test(text))
    return "추첨";
  if (
    previous === "쌍둥이 지원" &&
    /^(?:대표|낙첨|미달|본추첨|본 추첨|정원 외|그 인원|각자|개별 방식|동반)/u.test(
      text,
    )
  )
    return previous;
  if (
    /^(?:수업료와 입학금|학교가 정한 수업료)|납입고지서|지정 금융기관|지정 기간.*납부/u.test(
      text,
    )
  )
    return "납부 금액·방법";
  if (/\d+\s*(?:명|학급)/u.test(text) && /모집|학급|정원|신입생/u.test(text))
    return "모집 인원";
  if (/수업료|등록금|교육비|방과후|급식/u.test(text)) return "교육비";
  if (/버스|통학|교통비/u.test(text) && !/대상|모집한다/u.test(text))
    return "통학";
  if (/입학금|전형료|납부|입금자/u.test(text)) return "납부 금액·방법";
  if (/출생|년생|적령|취학 예정 아동/u.test(text)) return "지원 대상";
  if (/^(?:취학|조기입학|지원 자격)|국적|미취학/u.test(text))
    return "지원 자격";
  if (/설명회|학교설명회/u.test(text)) return "설명회";
  if (/^(?:당첨자 발표|당첨 발표|결과|추첨 결과)|결과를 알린다/u.test(text))
    return "결과 발표";
  if (/등록/u.test(text) && !/주민등록/u.test(text)) return "등록";
  if (/추첨/u.test(text)) return "추첨";
  if (/접수|지원할 수/u.test(text)) return "원서접수";
  // References such as "낙첨하면", "그 기간", and monetary-year qualifiers
  // remain attached to their preceding subject rather than guessed anew.
  return previous ?? fallback;
}

/** Expand only explicitly compound topic headings. Unknown/single headings
 * retain their context; no school slug, copied admission data or network I/O. */
export function admissionReadingGroups(
  section: AdmissionSection,
): AdmissionReadingGroup[] {
  const topics = headingRules
    .filter(([, pattern]) => pattern.test(section.heading ?? ""))
    .map(([topic]) => topic);
  if (
    topics.length < 2 ||
    /원문|확인 범위|확인 필요|후속|예비학교|Q&A|질문|돌봄/u.test(
      section.heading ?? "",
    )
  ) {
    return [
      {
        heading: section.heading,
        paragraphs: section.paragraphs.flatMap(admissionReadingItems),
        context: [],
      },
    ];
  }
  const groups = new Map<Topic, AdmissionReadingGroup>();
  const monetaryTopics: Topic[] = ["교육비", "납부 금액·방법", "통학"];
  const context: string[] = [];
  const add = (topic: Topic, text: string) => {
    if (!groups.has(topic))
      groups.set(topic, { heading: topic, paragraphs: [], context: [] });
    groups.get(topic)!.paragraphs.push(text);
  };
  for (const paragraph of section.paragraphs) {
    let previous: Topic | null = null;
    const sentences = admissionReadingItems(paragraph).flatMap((sentence) => {
      // An explicit change of subject in a cost list is a safe clause boundary.
      const transport =
        /^(급식은 .+?)(?:이며|이고)\s+(통학버스비[\s\S]+)$/u.exec(sentence);
      return transport ? [transport[1]!, transport[2]!] : [sentence];
    });
    for (const sentence of sentences) {
      // Split only an explicit ordinary-cohort + exceptional-eligibility clause.
      // Remove the joining conjunction, not any condition or source value.
      const audience =
        /^(.*?(?:적령\s*아동|출생(?:한)?\s*아동))(?:과| 및|을 대상으로 하며,)\s+(취학의무[\s\S]+)$/u.exec(
          sentence,
        );
      if (audience && topics.includes("지원 대상")) {
        add("지원 대상", audience[1]!);
        add("지원 자격", audience[2]!);
        previous = "지원 자격";
        continue;
      }
      let topic = sentenceTopic(sentence, previous, topics[0]!);
      if (
        /20\d{2}학년도.*(?:기준|현재|변동)|(?:금액|비용).*변동/u.test(
          sentence,
        ) &&
        !/\d[\d,]*\s*원/u.test(sentence)
      ) {
        const moneyTopic =
          [...groups.keys()].find((key) => key === "교육비") ??
          [...groups.keys()].find((key) => monetaryTopics.includes(key));
        if (moneyTopic) {
          topic = moneyTopic;
          context.push(sentence);
        }
      }
      add(topic, sentence);
      previous = topic;
    }
  }
  // A shared year/change qualifier is not allowed to disappear when monetary
  // sentences in the same original section are moved into separate panels.
  for (const [topic, group] of groups) {
    if (monetaryTopics.includes(topic))
      group.context = context.filter(
        (text) => !group.paragraphs.includes(text),
      );
  }
  return [...groups.values()];
}
