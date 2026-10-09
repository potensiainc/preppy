import Link from "next/link";
import { notFound } from "next/navigation";
import { getHomePage } from "@/src/modules/public/home-query.server";
import { getPublicExecutor } from "@/app/_lib/public-page.server";
import { ArticleCard, OpportunityCard } from "@/app/_components/public-cards";
import styles from "@/app/_components/curation.module.css";
export const dynamic = "force-dynamic";
const topics = {
  calendar: {
    title: "모집·입학 일정",
    description:
      "PREPPY에 공개된 모집·입학 안내를 모았어요. 신청 기간과 행사 날짜는 각 안내에서 구분해 확인해 주세요.",
  },
  briefings: {
    title: "학교 설명회",
    description:
      "공개된 입학 안내 중 설명회를 모았어요. 자녀 동반 여부와 회차별 참석 조건은 학교 안내를 확인해 주세요.",
  },
  guides: {
    title: "입학 준비 아티클",
    description: "학교를 알아보고 입학을 준비할 때 참고할 내용을 모았어요.",
  },
};
type Topic = keyof typeof topics;
function isTopic(value: string): value is Topic {
  return Object.hasOwn(topics, value);
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  return {
    title: `${isTopic(topic) ? topics[topic].title : "큐레이션"} | PREPPY`,
    robots: { index: false, follow: true },
  };
}
export default async function CurationPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!isTopic(topic)) notFound();
  const data = await getHomePage(getPublicExecutor());
  const items =
    topic === "briefings"
      ? data.currentOpportunities.filter(
          (item) => item.kind === "INFORMATION_SESSION",
        )
      : data.currentOpportunities;
  const empty =
    topic === "guides" ? !data.latestArticles.length : !items.length;
  return (
    <div className={styles.collection}>
      <Link className={styles.back} href="/">
        ← 추천으로
      </Link>
      <p className={styles.kicker}>CURATED BY PREPPY</p>
      <h1>{topics[topic].title}</h1>
      <p className={styles.intro}>{topics[topic].description}</p>
      <nav className={styles.collectionNav} aria-label="큐레이션 종류">
        {Object.entries(topics).map(([key, item]) => (
          <Link
            key={key}
            href={`/curation/${key}`}
            aria-current={key === topic ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      {empty ? (
        <div className={styles.empty}>
          <h2>현재 이 모음에 공개된 안내가 없어요</h2>
          <p>
            학교·기관별 상세 페이지에서 확인된 정보와 공식 안내를 살펴보세요.
          </p>
          <Link href="/institutions">학교·기관 살펴보기 →</Link>
        </div>
      ) : (
        <>
          <p className={styles.trust}>
            {topic === "guides"
              ? "최근 공개된 아티클을 보여드려요."
              : "홈에 소개된 공개 안내를 모은 목록이에요. 전체 학교의 모든 일정을 뜻하지 않아요."}
          </p>
          <div className={styles.articleGrid}>
            {topic === "guides"
              ? data.latestArticles.map((item) => (
                  <ArticleCard key={item.id} article={item} />
                ))
              : items.map((item) => (
                  <OpportunityCard key={item.id} opportunity={item} />
                ))}
          </div>
        </>
      )}
    </div>
  );
}
