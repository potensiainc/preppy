import type { Metadata } from "next";
import Link from "next/link";

import { ShareAction } from "@/app/_components/share-action";
import { PageContainer } from "@/app/_components/ui-primitives";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { listSeoulPrivateElementaryHubSchools } from "@/src/modules/public/private-elementary-hub.server";
import {
  buildSocialMetadata,
  getSeoAppBaseUrl,
} from "@/src/modules/public/seo";

import {
  PE_HUB_DESCRIPTION,
  PE_HUB_FAQ,
  PE_HUB_PATH,
  PE_HUB_SOURCES,
  PE_HUB_STEPS,
  PE_HUB_TITLE,
  PE_PORTAL_URL,
  type PeHubStep,
} from "./content";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const appBaseUrl = getSeoAppBaseUrl();
  const title = `${PE_HUB_TITLE} (38개교) | PREPPY`;
  const social = buildSocialMetadata(
    appBaseUrl,
    PE_HUB_PATH,
    PE_HUB_TITLE,
    PE_HUB_DESCRIPTION,
  );
  const image = new URL(`${PE_HUB_PATH}/og.png`, appBaseUrl).toString();
  return {
    title,
    description: PE_HUB_DESCRIPTION,
    alternates: { canonical: new URL(PE_HUB_PATH, appBaseUrl).toString() },
    robots: { index: true, follow: true },
    openGraph: {
      ...social.openGraph,
      type: "article",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: PE_HUB_TITLE,
          type: "image/png",
        },
      ],
    },
    twitter: { ...social.twitter, images: [{ url: image, alt: PE_HUB_TITLE }] },
  };
}

const DAY = 24 * 60 * 60 * 1000;

function kstDayNumber(time: number): number {
  return Math.floor((time + 9 * 60 * 60 * 1000) / DAY);
}

function dday(target: number, now: number): string {
  const diff = kstDayNumber(target) - kstDayNumber(now);
  return diff <= 0 ? "오늘" : `D-${diff}`;
}

function stepTimes(step: PeHubStep) {
  return { start: Date.parse(step.start), end: Date.parse(step.end) };
}

function hubStatus(
  now: number,
): Readonly<{
  headline: string;
  sub: string;
  currentId: PeHubStep["id"] | null;
}> {
  const [apply, lottery, register] = PE_HUB_STEPS.map(stepTimes) as [
    ReturnType<typeof stepTimes>,
    ReturnType<typeof stepTimes>,
    ReturnType<typeof stepTimes>,
  ];
  if (now < apply.start)
    return {
      headline: `원서접수 시작 ${dday(apply.start, now)}`,
      sub: "11월 6일(금) 오전 9시부터 입학포털에서 접수해요.",
      currentId: null,
    };
  if (now <= apply.end)
    return {
      headline: `원서접수 중 · 마감 ${dday(apply.end, now)}`,
      sub: "11월 11일(수) 오후 4시 30분에 마감해요. 마감일에는 접속이 몰리니 미리 접수하세요.",
      currentId: "apply",
    };
  if (now < lottery.start)
    return {
      headline: `접수 마감 · 전산추첨 ${dday(lottery.start, now)}`,
      sub: "11월 16일(월) 오전 11시에 전산추첨을 해요.",
      currentId: "lottery",
    };
  if (now < register.start)
    return {
      headline: "추첨 결과 확인 · 내일 오전 9시부터 등록",
      sub: "결과는 지원한 학교와 입학포털 안내에 따라 확인하세요. 등록은 한 학교만 할 수 있어요.",
      currentId: "lottery",
    };
  if (now <= register.end)
    return {
      headline: `당첨자 등록 기간 · 마감 ${dday(register.end, now)}`,
      sub: "11월 19일(목) 오후 4시 30분까지 한 학교에만 등록하세요.",
      currentId: "register",
    };
  return {
    headline: "2027학년도 공동 전형이 끝났어요",
    sub: "결원에 따른 추가 모집은 학교별 공지를 확인하세요.",
    currentId: null,
  };
}

// Status is evaluated per request (force-dynamic), not per render pass.
function requestTime(): number {
  return Date.now();
}

export default async function SeoulPrivateElementary2027Page() {
  const status = hubStatus(requestTime());
  const schools =
    await listSeoulPrivateElementaryHubSchools(getPublicExecutor());
  const byDistrict = new Map<string, (typeof schools)[number][]>();
  for (const school of schools) {
    const key = school.district ?? "기타";
    byDistrict.set(key, [...(byDistrict.get(key) ?? []), school]);
  }

  return (
    <PageContainer>
      <article className="pe-hub">
        <p className="eyebrow">2027학년도 서울 사립초 입학</p>
        <h1>{PE_HUB_TITLE}</h1>
        <div className="pe-hub__status" role="status">
          <strong>{status.headline}</strong>
          <span>{status.sub}</span>
        </div>
        <ShareAction path={PE_HUB_PATH} title={PE_HUB_TITLE} />

        <section aria-labelledby="pe-hub-schedule">
          <h2 id="pe-hub-schedule">공동 전형 일정</h2>
          <ol className="pe-hub__timeline">
            {PE_HUB_STEPS.map((step) => (
              <li key={step.id} data-current={status.currentId === step.id}>
                <b>{step.label}</b>
                <div>
                  {step.when}
                  <small>{step.detail}</small>
                </div>
              </li>
            ))}
          </ol>
          <p className="pe-hub__note">
            접수처:{" "}
            <a href={PE_PORTAL_URL} target="_blank" rel="noopener noreferrer">
              서울 사립초 입학포털
            </a>{" "}
            (학교 홈페이지에서는 접수하지 않아요)
          </p>
        </section>

        <section aria-labelledby="pe-hub-schools">
          <h2 id="pe-hub-schools">
            학교별 모집·추첨·등록 안내 ({schools.length}개교)
          </h2>
          <p className="pe-hub__note">
            학교 이름을 누르면 모집 인원, 지원 자격, 학비, 설명회를 볼 수
            있어요.
          </p>
          {[...byDistrict.entries()].map(([district, list]) => (
            <div key={district}>
              <h3 className="pe-hub__district">{district}</h3>
              <ul className="pe-hub__schools">
                {list.map((school) => (
                  <li key={school.href}>
                    <Link href={school.href}>
                      {school.name}
                      <small>
                        {school.hasArticle ? "2027 입학 안내" : "학교 정보"}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="pe-hub-faq">
          <h2 id="pe-hub-faq">자주 묻는 질문</h2>
          <dl className="pe-hub__faq">
            {PE_HUB_FAQ.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="pe-hub-sources">
          <h2 id="pe-hub-sources">출처</h2>
          <p className="pe-hub__note">
            {PE_HUB_SOURCES.map((source, index) => (
              <span key={source.url}>
                {index > 0 ? " · " : ""}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </a>
              </span>
            ))}
            . 일정은 교육청·학교 공지로 바뀔 수 있어요. 접수 전 입학포털에서 한
            번 더 확인하세요.
          </p>
        </section>
      </article>
    </PageContainer>
  );
}
