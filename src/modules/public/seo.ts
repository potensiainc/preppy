import "server-only";

import type { Metadata } from "next";
import { publicAdmissionText } from "./admission-copy";
import { publicProse } from "./ux-writing";

import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import type {
  InstitutionDetailDTO,
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";

export const SITE_NAME = "PREPPY 프레피";
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

type OrganizationJsonLd = Readonly<{
  "@type": "Organization";
  name: string;
  url: string;
  logo?: Readonly<{ "@type": "ImageObject"; url: string }>;
}>;

export type ArticleJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  mainEntityOfPage: string;
  datePublished: string;
  dateModified: string;
  inLanguage: "ko-KR";
  articleSection: string;
  author: OrganizationJsonLd;
  publisher: OrganizationJsonLd;
  image: readonly string[];
  keywords?: string;
}>;

export type ArticleBreadcrumbJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: readonly [
    Readonly<{
      "@type": "ListItem";
      position: 1;
      name: "홈";
      item: string;
    }>,
    Readonly<{
      "@type": "ListItem";
      position: 2;
      name: "입학 가이드";
      item: string;
    }>,
    Readonly<{
      "@type": "ListItem";
      position: 3;
      name: string;
      item: string;
    }>,
  ];
}>;

const ARTICLE_SECTION_LABELS: Readonly<
  Record<PublicArticleDTO["category"], string>
> = {
  ENGLISH_KINDERGARTEN: "영어유치원",
  PRIVATE_ELEMENTARY: "사립초등학교",
  INTERNATIONAL_SCHOOL: "국제학교",
  ADMISSIONS_GENERAL: "입학 일반",
};

function origin(appBaseUrl: string): string {
  const url = new URL(appBaseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("APP_BASE_URL must be a credential-free HTTP(S) URL");
  }
  return url.origin;
}

export function getSeoAppBaseUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  if (!environment.APP_BASE_URL) throw new Error("APP_BASE_URL is required");
  return origin(environment.APP_BASE_URL);
}

function canonical(appBaseUrl: string, path: string): string {
  return new URL(path, `${origin(appBaseUrl)}/`).toString();
}

function robots(
  indexability: "INDEX" | "NOINDEX" | "NOT_PUBLIC",
  follow = true,
) {
  return { index: indexability === "INDEX", follow };
}

function safeAbsoluteImage(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function organization(appBaseUrl: string): OrganizationJsonLd {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: canonical(appBaseUrl, "/"),
    logo: { "@type": "ImageObject", url: canonical(appBaseUrl, "/og/logo") },
  };
}

/** Versioned so share caches refetch after every Article update. */
export function articleOgImageUrl(
  dto: Pick<PublicArticleDTO, "slug" | "updatedAt">,
  appBaseUrl: string,
): string {
  const version = Date.parse(dto.updatedAt);
  return canonical(
    appBaseUrl,
    `/og/articles/${dto.slug}${Number.isFinite(version) ? `?v=${version}` : ""}`,
  );
}

export function defaultOgImage(appBaseUrl: string) {
  return {
    url: canonical(appBaseUrl, "/og/default"),
    ...OG_IMAGE_SIZE,
    alt: "PREPPY 프레피 — 영어유치원·사립초·국제학교 입학정보",
  };
}

/**
 * Site-wide defaults. Statically prerendered pages (404, terms, privacy) also
 * inherit these at build time, so nothing here may carry an absolute URL or a
 * runtime secret; URL-bearing defaults live in `websiteOpenGraph`.
 */
export function buildRootMetadata(appBaseUrl: string): Metadata {
  return {
    metadataBase: new URL(origin(appBaseUrl)),
    applicationName: SITE_NAME,
    twitter: { card: "summary_large_image" },
  };
}

/** Default share card for dynamic, non-Article pages. */
function websiteOpenGraph(
  appBaseUrl: string,
  path: string,
  title: string,
  description: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  const image = defaultOgImage(appBaseUrl);
  return {
    openGraph: {
      title,
      description,
      url: canonical(appBaseUrl, path),
      siteName: SITE_NAME,
      locale: "ko_KR",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

/** Search-console ownership tags, read at request time on the home page. */
export function siteVerification(
  environment: Record<string, string | undefined> = process.env,
): Pick<Metadata, "verification"> {
  const google = environment.GOOGLE_SITE_VERIFICATION?.trim();
  const naver = environment.NAVER_SITE_VERIFICATION?.trim();
  if (!google && !naver) return {};
  return {
    verification: {
      ...(google ? { google } : {}),
      ...(naver ? { other: { "naver-site-verification": naver } } : {}),
    },
  };
}

export function buildArticleListMetadata(
  appBaseUrl: string,
  page: number,
  hasArticles: boolean,
): Metadata {
  const path = page > 1 ? `/articles?page=${page}` : "/articles";
  const title =
    page > 1 ? `입학 가이드 ${page}페이지 | PREPPY` : "입학 가이드 | PREPPY";
  const description =
    "영어유치원·사립초·국제학교 입학 일정과 준비 방법을 공식 안내를 바탕으로 정리했어요.";
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, path) },
    robots: { index: hasArticles, follow: true },
    ...websiteOpenGraph(appBaseUrl, path, title, description),
  };
}

export function buildArticleTagMetadata(
  appBaseUrl: string,
  tag: string,
  page: number,
  indexable: boolean,
): Metadata {
  const base = `/articles/tag/${encodeURIComponent(tag)}`;
  const path = page > 1 ? `${base}?page=${page}` : base;
  const title = `${tag} 입학정보 모아보기${page > 1 ? ` ${page}페이지` : ""} | PREPPY`;
  const description = `‘${tag}’ 관련 입학 일정과 준비 방법을 모아봤어요.`;
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, path) },
    robots: { index: indexable, follow: true },
    ...websiteOpenGraph(appBaseUrl, path, title, description),
  };
}

export function buildHomeMetadata(
  appBaseUrl: string,
  environment: Record<string, string | undefined> = process.env,
): Metadata {
  const title = "PREPPY | 입학정보를 더 차분하게";
  const description =
    "학교와 기관의 공식 안내를 바탕으로 입학 일정과 지원 조건을 한곳에서 확인해 보세요.";
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, "/") },
    robots: { index: true, follow: true },
    ...websiteOpenGraph(appBaseUrl, "/", title, description),
    ...siteVerification(environment),
  };
}

export function buildInstitutionListMetadata(
  appBaseUrl: string,
  hasFilters: boolean,
): Metadata {
  const title = "기관 찾기 | PREPPY";
  const description =
    "관심 있는 학교와 기관을 찾고, 공개된 입학 일정과 지원 조건을 확인해 보세요.";
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, "/institutions") },
    robots: { index: !hasFilters, follow: true },
    ...websiteOpenGraph(appBaseUrl, "/institutions", title, description),
  };
}

export function buildInstitutionMetadata(
  dto: InstitutionDetailDTO,
  appBaseUrl: string,
): Metadata {
  const title = `${dto.institution.name} | PREPPY`;
  const description = `${dto.institution.name}의 기관 정보와 공식 안내를 확인해 보세요.`;
  const path = `/institutions/${dto.institution.slug}`;
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, path) },
    robots: robots(dto.indexability),
    ...websiteOpenGraph(appBaseUrl, path, title, description),
  };
}

export function buildOpportunityMetadata(
  dto: PublicOpportunityDTO,
  appBaseUrl: string,
): Metadata {
  const title = `${dto.title} | PREPPY`;
  const description =
    publicProse(publicAdmissionText(dto.summary)) ??
    `${dto.institution.name}의 입학 안내를 확인해 보세요.`;
  const path = `/opportunities/${dto.slug}`;
  return {
    title,
    description,
    alternates: { canonical: canonical(appBaseUrl, path) },
    robots: robots(dto.indexability),
    ...websiteOpenGraph(appBaseUrl, path, title, description),
  };
}

export function buildArticleMetadata(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Metadata {
  const title = dto.seoTitle ?? dto.title;
  const description =
    publicProse(dto.seoDescription ?? dto.excerpt) ?? undefined;
  const url = canonical(appBaseUrl, `/articles/${dto.slug}`);
  const tags = [...(dto.tags ?? [])];
  const image = {
    url: articleOgImageUrl(dto, appBaseUrl),
    ...OG_IMAGE_SIZE,
    alt: dto.featuredImageAlt ?? dto.title,
  };
  return {
    title,
    description,
    ...(tags.length > 0 ? { keywords: tags } : {}),
    alternates: { canonical: url },
    robots: robots(dto.indexability, dto.robotsFollow),
    openGraph: {
      title,
      description,
      type: "article",
      url,
      siteName: SITE_NAME,
      locale: "ko_KR",
      ...(dto.publishedAt ? { publishedTime: dto.publishedAt } : {}),
      modifiedTime: dto.updatedAt,
      section: ARTICLE_SECTION_LABELS[dto.category],
      ...(tags.length > 0 ? { tags } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}

function articleStructuredDataEligibility(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Readonly<{ description: string; canonical: string }> | null {
  const description = dto.seoDescription ?? dto.excerpt;
  if (
    dto.indexability !== "INDEX" ||
    dto.publishedAt === null ||
    description === null ||
    description.trim() === ""
  ) {
    return null;
  }
  const sanitized = sanitizeArticleHtmlV1(dto.sanitizedContentHtml, {
    appBaseUrl,
  });
  if (sanitized.nonWhitespaceCodePoints < 40) return null;
  let canonicalUrl: string;
  try {
    canonicalUrl = canonical(appBaseUrl, `/articles/${dto.slug}`);
  } catch {
    return null;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(dto.slug)) return null;
  return { description, canonical: canonicalUrl };
}

export function buildArticleJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleJsonLd | null {
  const eligible = articleStructuredDataEligibility(dto, appBaseUrl);
  if (!eligible) return null;
  const featured = safeAbsoluteImage(dto.featuredImageUrl);
  const tags = dto.tags ?? [];
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: dto.title,
    description: publicProse(eligible.description),
    mainEntityOfPage: eligible.canonical,
    datePublished: dto.publishedAt!,
    dateModified: dto.updatedAt,
    inLanguage: "ko-KR",
    articleSection: ARTICLE_SECTION_LABELS[dto.category],
    author: organization(appBaseUrl),
    publisher: organization(appBaseUrl),
    image: [
      articleOgImageUrl(dto, appBaseUrl),
      ...(featured === null ? [] : [featured]),
    ],
    ...(tags.length > 0 ? { keywords: tags.join(", ") } : {}),
  };
}

export function buildArticleBreadcrumbJsonLd(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): ArticleBreadcrumbJsonLd | null {
  const eligible = articleStructuredDataEligibility(dto, appBaseUrl);
  if (!eligible) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: canonical(appBaseUrl, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "입학 가이드",
        item: canonical(appBaseUrl, "/articles"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: dto.title,
        item: eligible.canonical,
      },
    ],
  };
}

export function serializeJsonLd(
  value: ArticleJsonLd | ArticleBreadcrumbJsonLd,
): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}
