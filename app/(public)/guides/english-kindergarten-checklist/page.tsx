import type { Metadata } from "next";

import {
  GuideCtaLink,
  GuideViewAnalytics,
} from "@/app/_components/campaign-analytics";
import { PageContainer } from "@/app/_components/ui-primitives";
import {
  buildSocialMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

import {
  EK_2027_SESSIONS_HREF,
  EK_CHECKLIST_DESCRIPTION,
  EK_CHECKLIST_PATH,
  EK_CHECKLIST_TITLE,
  SEOUL_EK_LIST_HREF,
  YANGCHEON_COMPARE_HREF,
} from "./content";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const appBaseUrl = getSeoAppBaseUrl();
  const title = `${EK_CHECKLIST_TITLE} | PREPPY`;
  const social = buildSocialMetadata(
    appBaseUrl,
    EK_CHECKLIST_PATH,
    title,
    EK_CHECKLIST_DESCRIPTION,
  );
  const image = new URL(`${EK_CHECKLIST_PATH}/og.png`, appBaseUrl).toString();
  return {
    title,
    description: EK_CHECKLIST_DESCRIPTION,
    alternates: { canonical: EK_CHECKLIST_PATH },
    openGraph: {
      ...social.openGraph,
      type: "article",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: EK_CHECKLIST_TITLE,
          type: "image/png",
        },
      ],
    },
    twitter: {
      ...social.twitter,
      images: [{ url: image, alt: EK_CHECKLIST_TITLE }],
    },
  };
}

type ChecklistItem = Readonly<{
  id: string;
  title: string;
  points: readonly string[];
  where: Readonly<{
    text: string;
    href?: string;
    target?: "COMPARE" | "CALENDAR" | "INSTITUTION_LIST";
    label?: string;
  }>;
}>;

const checklist: readonly ChecklistItem[] = [
  {
    id: "tuition",
    title: "원비",
    points: [
      "월 원비가 어느 학년도 기준인지 확인해 주세요.",
      "월·분기·학기 중 어떤 단위로 내는지 확인해 주세요.",
      "교재비, 차량비, 급식비, 방학 특강비가 따로 있는지 확인해 주세요.",
      "중도에 그만둘 때의 환불 기준도 함께 확인해 주세요.",
    ],
    where: {
      text: "비교표의 원비 열과 기관 상세의 원비 항목에서 확인할 수 있어요. 공식 안내에 원비가 없는 기관은 원내 문의가 필요하다고 표시해요.",
      href: YANGCHEON_COMPARE_HREF,
      target: "COMPARE",
      label: "비교표에서 원비 보기",
    },
  },
  {
    id: "age",
    title: "운영 연령",
    points: [
      "기관마다 나이 표기 기준이 달라요. 한국식 나이인지, 만 나이인지, 출생연도 기준인지 확인해 주세요.",
      "2027학년도에 우리 아이가 몇 세 반에 해당하는지 확인해 주세요.",
    ],
    where: {
      text: "비교표의 운영 연령 열과 설명회별 대상에서 기관이 표기한 나이를 그대로 보여드려요.",
      href: YANGCHEON_COMPARE_HREF,
      target: "COMPARE",
      label: "비교표에서 운영 연령 보기",
    },
  },
  {
    id: "hours",
    title: "수업 시간",
    points: [
      "등원·하원 시간과 하루 수업 시간을 확인해 주세요.",
      "연장반이나 방과후 프로그램이 있는지, 비용이 따로 드는지 확인해 주세요.",
    ],
    where: {
      text: "PREPPY에서는 아직 수업 시간을 기관별로 정리하지 않았어요. 설명회나 원내 상담에서 확인해 주세요.",
    },
  },
  {
    id: "shuttle",
    title: "셔틀",
    points: [
      "우리 집이 셔틀 운행 지역에 포함되는지 확인해 주세요.",
      "탑승 시간과 차량비가 따로 있는지 확인해 주세요.",
    ],
    where: {
      text: "비교표의 셔틀 열과 기관 상세의 셔틀 항목에서 확인할 수 있어요.",
      href: YANGCHEON_COMPARE_HREF,
      target: "COMPARE",
      label: "비교표에서 셔틀 보기",
    },
  },
  {
    id: "sessions",
    title: "설명회·입학 일정",
    points: [
      "설명회 예약이 언제 시작되는지, 회차별 대상 연령이 어떻게 다른지 확인해 주세요.",
      "레벨 테스트, 입학 상담, 등록 일정이 따로 있는지 확인해 주세요.",
      "설명회 신청이 마감돼도 행사 날짜는 아직 지나지 않았을 수 있어요. 예약 상태와 행사 날짜를 구분해서 봐 주세요.",
    ],
    where: {
      text: "2027학년도 설명회 일정에서 날짜와 예약 상태를 기관별로 확인할 수 있어요. 잔여석은 기관 예약 페이지에서 다시 확인해 주세요.",
      href: EK_2027_SESSIONS_HREF,
      target: "CALENDAR",
      label: "2027학년도 영어유치원 설명회 일정 보기",
    },
  },
  {
    id: "waitlist",
    title: "대기 여부",
    points: [
      "정원이 찼을 때 대기 등록을 받는지 확인해 주세요.",
      "대기 순서를 어떻게 안내하는지, 결원이 생기면 언제 연락하는지 확인해 주세요.",
    ],
    where: {
      text: "공식 안내에 대기 안내가 있는 기관은 기관 상세의 설명회 항목에 함께 적어요. 안내가 없는 기관은 원내에 문의해 주세요.",
      href: SEOUL_EK_LIST_HREF,
      target: "INSTITUTION_LIST",
      label: "서울 영어유치원 목록 보기",
    },
  },
];

const nextSteps = [
  {
    href: SEOUL_EK_LIST_HREF,
    target: "INSTITUTION_LIST",
    title: "지역별 영어유치원 비교",
    description: "서울 자치구별로 영어유치원을 찾아볼 수 있어요.",
  },
  {
    href: "/institutions?category=PRIVATE_ELEMENTARY&page=1",
    target: "PRIVATE_ELEMENTARY_CALENDAR",
    title: "사립초 입학 일정",
    description: "사립초등학교별 설명회와 모집 일정을 확인할 수 있어요.",
  },
  {
    href: "/curation/guides",
    target: "ARTICLES",
    title: "입학 준비 아티클",
    description: "입학을 준비할 때 참고할 내용을 모았어요.",
  },
] as const;

export default function EnglishKindergartenChecklistPage() {
  return (
    <PageContainer>
      <GuideViewAnalytics />
      <article className="ek-guide">
        <header className="ek-guide__hero">
          <p className="eyebrow">영어유치원 체크리스트</p>
          <h1>{EK_CHECKLIST_TITLE}</h1>
          <p>
            기관마다 안내 방식이 달라서 같은 기준으로 비교하기 어려워요. 목동
            영어유치원은 아래 비교표에서 한 번에 볼 수 있어요.
          </p>
          <nav className="ek-guide__actions" aria-label="바로 가기">
            <GuideCtaLink
              className="button-link button-link--primary"
              href={YANGCHEON_COMPARE_HREF}
              target="COMPARE"
            >
              목동(양천구) 영어유치원 비교표 보기
            </GuideCtaLink>
            <GuideCtaLink
              className="button-link button-link--secondary"
              href={EK_2027_SESSIONS_HREF}
              target="CALENDAR"
            >
              2027학년도 영어유치원 설명회 일정 보기
            </GuideCtaLink>
          </nav>
        </header>

        <section aria-labelledby="ek-guide-checklist">
          <h2 id="ek-guide-checklist">고를 때 확인할 항목</h2>
          <ol className="ek-guide__list">
            {checklist.map((item) => (
              <li key={item.id} id={item.id}>
                <h3>{item.title}</h3>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="ek-guide__where">
                  <strong>PREPPY에서 확인하는 곳</strong>
                  <span>{item.where.text}</span>
                  {item.where.href && item.where.target ? (
                    <GuideCtaLink
                      href={item.where.href}
                      target={item.where.target}
                    >
                      {item.where.label} →
                    </GuideCtaLink>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <p className="ek-guide__notice">
          PREPPY는 기관의 공식 안내를 기준으로 정리하고, 정보마다 내용 확인일을
          함께 보여드려요. 원비와 일정은 기관 사정에 따라 달라질 수 있으니 신청
          전에 공식 안내를 다시 확인해 주세요. PREPPY는 특정 기관을 추천하거나
          입학을 보장하지 않아요.
        </p>

        <section aria-labelledby="ek-guide-next">
          <h2 id="ek-guide-next">다음에 볼 것</h2>
          <ul className="ek-guide__next">
            {nextSteps.map((step) => (
              <li key={step.href}>
                <GuideCtaLink href={step.href} target={step.target}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </GuideCtaLink>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </PageContainer>
  );
}
