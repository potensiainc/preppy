/** Presentation-only register for PREPPY's reviewed prose. Never call this when
 * storing source evidence, interpreting eligibility or deriving business state.
 * Only known sentence endings change; unknown language and direct quotes stay.
 */
const endings: readonly [string, string][] = [
  ["하였습니다", "했어요"],
  ["했습니다", "했어요"],
  ["되었습니다", "됐어요"],
  ["있었습니다", "있었어요"],
  ["없었습니다", "없었어요"],
  ["않았습니다", "않았어요"],
  ["바랍니다", "바라요"],
  ["드립니다", "드려요"],
  ["부릅니다", "불러요"],
  ["다릅니다", "달라요"],
  ["따릅니다", "따라요"],
  ["있습니다", "있어요"],
  ["없습니다", "없어요"],
  ["않습니다", "않아요"],
  ["받습니다", "받아요"],
  ["합니다", "해요"],
  ["됩니다", "돼요"],
  ["아닙니다", "아니에요"],
  ["알립니다", "알려요"],
  ["하겠다", "하겠어요"],
  ["하였다", "했어요"],
  ["않았다", "않았어요"],
  ["있었다", "있었어요"],
  ["없었다", "없었어요"],
  ["받았다", "받았어요"],
  ["못했다", "못했어요"],
  ["했다", "했어요"],
  ["됐다", "됐어요"],
  ["적었다", "적었어요"],
  ["알린다", "알려요"],
  ["올린다", "올려요"],
  ["열린다", "열려요"],
  ["고른다", "골라요"],
  ["따른다", "따라요"],
  ["다르다", "달라요"],
  ["만든다", "만들어요"],
  ["채운다", "채워요"],
  ["붙인다", "붙여요"],
  ["뽑는다", "뽑아요"],
  ["받는다", "받아요"],
  ["입는다", "입어요"],
  ["삼는다", "삼아요"],
  ["보낸다", "보내요"],
  ["준다", "줘요"],
  ["낸다", "내요"],
  ["연다", "열어요"],
  ["본다", "봐요"],
  ["간다", "가요"],
  ["한다", "해요"],
  ["하다", "해요"],
  ["된다", "돼요"],
  ["않는다", "않아요"],
  ["않다", "않아요"],
  ["있다", "있어요"],
  ["없다", "없어요"],
  ["아니다", "아니에요"],
  ["별도다", "별도예요"],
  ["필수다", "필수예요"],
  ["까지다", "까지예요"],
  ["취소다", "취소예요"],
  ["순서다", "순서예요"],
  ["안내다", "안내예요"],
  ["범위다", "범위예요"],
  ["결제다", "결제예요"],
  ["휴무다", "휴무예요"],
  ["교시다", "교시예요"],
  ["동의서다", "동의서예요"],
  ["는지다", "는지예요"],
];

function copula(before: string): string {
  const spoken = before.replace(/[)\]”’"']+$/gu, "").at(-1);
  if (!spoken) return "이에요";
  const code = spoken.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 0 ? "예요" : "이에요";
}

export function publicProse(value: string): string;
export function publicProse(value: string | null): string | null;
export function publicProse(value: string | null): string | null {
  if (!value) return value;
  const protectedSpans: string[] = [];
  const protect = (span: string) => {
    protectedSpans.push(span);
    return `\uE002${protectedSpans.length - 1}\uE003`;
  };
  const text = value.replace(
    /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|`[^`]*`|“[^”]*”|‘[^’]*’|"[^"\n]*"|'[^'\n]*'|^\s*\[[^\]\n]+\]\s*$/gmu,
    protect,
  );
  // An unclosed quotation may continue across an editorial text-node boundary.
  // Fail closed rather than rephrasing a fragment of somebody else's words.
  if (/[“”‘’"]/u.test(text)) return value;
  return text
    .replace(/[;；]\s*/gu, ", ")
    .replace(
      /(\d+(?:개)?교|\d+(?:\.\d+)?%)다(?=[.!?](?:\s|$)|\r?\n|$)/gu,
      "$1예요",
    )
    .replace(
      /([가-힣]+)(?=[.!?](?:\s|$)|\r?\n|$)/gu,
      (word: string, _: string, offset: number, sentence: string) => {
        // A copula is not a generic 다 suffix: 바다 and other proper nouns are
        // untouched. Keep modality/negation in the preceding clause unchanged.
        if (
          word.endsWith("입니다") ||
          (word.endsWith("이다") &&
            (word === "이다" ||
              /(?:명|원|생|일|출석|대상|합격|낙첨|당첨|이름|전형|예정|교무실|부담|마감|기준|추첨|책임|일정|번|무상|입학|교장|조건|동의서|순번|지역|가능|수도권|요강|기록부|전역|방식|강당|성남시|반명함판|반)이다$/u.test(
                word,
              )))
        ) {
          const suffix = word.endsWith("입니다") ? "입니다" : "이다";
          const stem = word.slice(0, -suffix.length);
          return stem + copula(sentence.slice(0, offset) + stem);
        }
        for (const [ending, replacement] of endings) {
          if (word.endsWith(ending))
            return word.slice(0, -ending.length) + replacement;
        }
        return word;
      },
    )
    .replace(
      /\uE002(\d+)\uE003/gu,
      (_, index: string) => protectedSpans[Number(index)]!,
    );
}
