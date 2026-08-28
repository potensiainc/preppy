export type CandidateClassification =
  | "ADMISSIONS"
  | "APPLICATION"
  | "TUITION"
  | "CURRICULUM"
  | "NOTICE"
  | "OPEN_HOUSE"
  | "CONTACT"
  | "OTHER";

export function classifyCandidate(
  _input: Readonly<{
    url: string;
    anchorText: string;
  }>,
): CandidateClassification {
  let path = _input.url;
  try {
    path = decodeURIComponent(new URL(_input.url).pathname);
  } catch {
    // Classification is a hint; malformed input falls back to literal text.
  }
  const haystack = `${path} ${_input.anchorText}`
    .normalize("NFC")
    .toLowerCase();
  const rules: readonly Readonly<{
    classification: Exclude<CandidateClassification, "OTHER">;
    keywords: readonly string[];
  }>[] = [
    {
      classification: "OPEN_HOUSE",
      keywords: ["open house", "open-house", "오픈하우스", "설명회"],
    },
    {
      classification: "ADMISSIONS",
      keywords: [
        "admission",
        "admissions",
        "입학",
        "모집",
        "모집요강",
        "지원자격",
      ],
    },
    {
      classification: "APPLICATION",
      keywords: ["apply", "application", "원서", "원서접수", "지원"],
    },
    {
      classification: "TUITION",
      keywords: ["tuition", "fee", "fees", "학비", "등록금"],
    },
    {
      classification: "CURRICULUM",
      keywords: ["curriculum", "program", "교육과정", "커리큘럼"],
    },
    {
      classification: "NOTICE",
      keywords: ["notice", "news", "공지", "공지사항"],
    },
    {
      classification: "CONTACT",
      keywords: ["contact", "연락처", "문의"],
    },
  ];
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.classification;
    }
  }
  return "OTHER";
}
