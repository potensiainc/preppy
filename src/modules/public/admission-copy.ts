/** Public copy policy for extracted/reviewed admission guidance.
 * Evidence stays unchanged in storage. Do not infer dates, fees or eligibility
 * while removing document mechanics and editorial review commentary.
 */
export function isAdmissionAuditHeading(heading: string): boolean {
  return /원문|확인\s*범위|검수|검토\s*(?:내용|기록)|출처|수집\s*(?:내용|기록)/u.test(
    heading,
  );
}

const pageReference =
  /(?:\bPDF\s*)?(?:제\s*)?\d+(?:\s*[·,~–-]\s*\d+)*\s*(?:쪽|페이지)(?:\s*(?:에\s*따르면|참조|참고|에는|에서|에|은|는))?/giu;
const documentTerm = /\b(?:PDF|HWPX?|HTML|ZIP|OCR)\b|원문|첨부파일|파일명/iu;
const reviewCommentary =
  /(?:표현|단서).*(?:보존|유지)|보존했|보존한다|추정하지|확보하지|확보되지|대조했|판독하지|미검토|재게시|임의로|확정하지|근거로 사용|요약했다|두 표현|검토하지|확인하지 못했다|확인되지 않았다/u;

function cleanSentence(value: string): string {
  const urls: string[] = [];
  let text = value.trim().replace(/https?:\/\/\S+/giu, (url) => {
    urls.push(url);
    return `\uE000${urls.length - 1}\uE001`;
  });
  // Strip editorial clauses before evaluating the rest of a mixed sentence.
  // Keep payer-name instructions without newly surfacing a quoted account.
  text = text
    .replace(/^종료 연도를 임의로 .+?바꾸지 않았으며\s*/u, "")
    .replace(
      /(입학금과 수업료는 자율화되어 있다)고만 적혀 있으며 구체적인[^.!?]*PDF에 없다\.?/gu,
      "$1.",
    )
    .replace(
      /['‘](.+?)['’]라고 적혀 있어 (.+?) 모집 표제와의 연도 관계를 학교에 확인해야 한다\.?/gu,
      "$1로 안내되어 있으나, $2 모집 학년도와의 관계는 학교에 확인해야 한다.",
    )
    .replace(/이며\s*원문\s*계좌는[^.!?]*이다\.?/gu, "이다.")
    .replace(
      /다고\s*안내하며,\s*실제 개인정보를 이 요약에 수집하거나 재게시하지 않는다\.?/gu,
      "다.",
    );
  // An absence in a particular file is not an admission rule.
  if (
    reviewCommentary.test(text) ||
    (documentTerm.test(text) &&
      /(?:금액|통학비|환불 규정|세부사항|규칙)[^.!?]*(?:없다|없어|제시되지|미확인)|(?:PDF|문서|파일)(?:에|에는)\s*없/u.test(
        text,
      ))
  )
    return "";

  // Keep the actual eligibility clause before a generic document referral.
  text = text.replace(
    /(?:이며|이며,|이고|으로)\s*(?:전형별\s*)?(?:상세|세부)\s*(?:자격|내용|사항)[^.!?]*(?:PDF|원문|첨부파일)[^.!?]*[.!?]?/giu,
    "이다.",
  );
  text = text
    .replace(
      /^예정 안내 · 변경 가능:.*(?:원문|초안).*$/u,
      "예정 안내 · 변경 가능: 일정과 지원 조건이 변경될 수 있습니다.",
    )
    .replace(
      /\(\s*(?:PDF\s*)?(?:제\s*)?\d+(?:\s*[·,~–-]\s*\d+)*\s*(?:쪽|페이지)(?:\s*(?:참조|참고))?\s*\)/giu,
      "",
    )
    .replace(pageReference, "")
    .replace(
      /(?:공식\s*)?원문(?:상|에\s*따르면|에서|에|이\s*(?:표시한|명시한)|의|은|이)?\s*/gu,
      "",
    )
    .replace(/(?:연결(?:된)?\s*)?HTML(?:에\s*따르면|에서|은|는)?\s*/giu, "")
    .replace(
      /(?:공식\s*)?PDF(?:\s*(?:문서|파일))?(?:에\s*따르면|에는|에서|에|은|는)?\s*/giu,
      "",
    )
    .replace(/”(?:이라고|라고)\s*(?:명시한다|적혀\s*있다)/gu, "”")
    .replace(
      /(?:이라고|라고)\s*(?:명시한다|적혀\s*있다|표기되어\s*있다)/gu,
      "이다",
    )
    .replace(/다고\s*(?:명시한다|적혀\s*있다|표기되어\s*있다)/gu, "다")
    .replace(/다고(?:만)?\s*적혀\s*있으며/gu, "으며")
    .replace(/다고도\s*적혀\s*있어/gu, "므로")
    .replace(/으로\s*적혀\s*있다/gu, "이다")
    .replace(/(?:으로\s*)?표기(?:되어\s*있다|됐다)/gu, "이다")
    .replace(/([.!?]”)\./gu, "$1")
    .replace(/\s+([.,])/gu, "$1")
    .trim();
  // Never discard an admission condition merely because it mentions a document.
  // Only explicit audit/absence commentary is removed above.
  if (/^(?:참조|참고|확인)[.!]?$/u.test(text)) return "";
  return text.replace(
    /\uE000(\d+)\uE001/gu,
    (_, index: string) => urls[Number(index)]!,
  );
}

/** Audit containers may hold unique fee/eligibility caveats. Reclassify only
 * these actionable qualifications; never republish the review narrative. */
function admissionAuditCaveat(line: string): string | null {
  const deferred =
    /원문은 (\d{4})년생 취학유예자의 유예 학년도를 [‘'](\d{4})학년도[’']로 적고 있다\.\s*출생연도와 학년도 조합이 통상 연령과 맞지 않으므로 임의로 고치지 않았으며 해당자는 학교 확인이 필요하다\.?/u.exec(
      line,
    );
  if (deferred) {
    return `${deferred[1]}년생 취학유예자의 ${deferred[2]}학년도 유예 조건은 출생연도와 학년도 관계를 학교에 확인해야 한다.`;
  }
  if (
    /^(?:수업료|교육비|비용|금액)/u.test(line) &&
    /변동|조정|상승/u.test(line)
  ) {
    return cleanSentence(line) || null;
  }
  return null;
}

/** Keeps paragraph boundaries; hides audit sections even for already saved data. */
export function publicAdmissionText(value: string | null): string | null {
  if (!value) return null;
  let audit = false;
  const caveats: string[] = [];
  const lines = value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .flatMap((line) => {
      const heading = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
      if (heading) {
        audit = isAdmissionAuditHeading(heading[1]!);
        const label = audit ? "" : cleanSentence(heading[1]!);
        return label ? [`[${label}]`] : [];
      }
      if (audit) {
        const caveat = admissionAuditCaveat(line.trim());
        if (caveat) caveats.push(caveat);
        return [];
      }
      // A decimal, date or URL is never a sentence boundary.
      return [
        line
          .split(/(?<=[가-힣”’)][.!?])\s+/u)
          .map(cleanSentence)
          .filter(Boolean)
          .join(" "),
      ];
    });
  const normalize = (text: string) => text.replace(/\s/gu, "");
  const body = normalize(lines.join("\n"));
  const uniqueCaveats = [...new Set(caveats)].filter(
    (caveat) => !body.includes(normalize(caveat)),
  );
  if (uniqueCaveats.length) lines.push("", "[유의사항]", ...uniqueCaveats);
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim() || null
  );
}
