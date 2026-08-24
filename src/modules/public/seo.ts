import "server-only";

import type { Metadata } from "next";

import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import type {
  InstitutionDetailDTO,
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";

export type ArticleJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  mainEntityOfPage: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}>;

export type ArticleBreadcrumbJsonLd = Readonly<{
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: readonly [
    Readonly<{
      "@type": "ListItem";
      position: 1;
      name: "Home";
      item: string;
    }>,
    Readonly<{
      "@type": "ListItem";
      position: 2;
      name: string;
      item: string;
    }>,
  ];
}>;

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

export function buildHomeMetadata(appBaseUrl: string): Metadata {
  return {
    title: "PREPPY | 입학정보를 더 차분하게",
    description: "공식 출처를 바탕으로 정리한 프리미엄 입학정보 플랫폼",
    alternates: { canonical: canonical(appBaseUrl, "/") },
    robots: { index: true, follow: true },
  };
}

export function buildInstitutionListMetadata(
  appBaseUrl: string,
  hasFilters: boolean,
): Metadata {
  return {
    title: "기관 찾기 | PREPPY",
    description: "검증된 입학정보를 제공하는 기관을 찾아보세요.",
    alternates: { canonical: canonical(appBaseUrl, "/institutions") },
    robots: { index: !hasFilters, follow: true },
  };
}

export function buildInstitutionMetadata(
  dto: InstitutionDetailDTO,
  appBaseUrl: string,
): Metadata {
  return {
    title: `${dto.institution.name} | PREPPY`,
    description: `${dto.institution.name}의 검증된 입학정보와 공식 출처를 확인하세요.`,
    alternates: {
      canonical: canonical(appBaseUrl, `/institutions/${dto.institution.slug}`),
    },
    robots: robots(dto.indexability),
  };
}

export function buildOpportunityMetadata(
  dto: PublicOpportunityDTO,
  appBaseUrl: string,
): Metadata {
  return {
    title: `${dto.title} | PREPPY`,
    description:
      dto.summary ?? `${dto.institution.name}의 검증된 입학정보입니다.`,
    alternates: {
      canonical: canonical(appBaseUrl, `/opportunities/${dto.slug}`),
    },
    robots: robots(dto.indexability),
  };
}

export function buildArticleMetadata(
  dto: PublicArticleDTO,
  appBaseUrl: string,
): Metadata {
  const image = safeAbsoluteImage(dto.featuredImageUrl);
  return {
    title: dto.seoTitle ?? dto.title,
    description: dto.seoDescription ?? dto.excerpt ?? undefined,
    alternates: {
      canonical: canonical(appBaseUrl, `/articles/${dto.slug}`),
    },
    robots: robots(dto.indexability, dto.robotsFollow),
    openGraph: {
      title: dto.seoTitle ?? dto.title,
      description: dto.seoDescription ?? dto.excerpt ?? undefined,
      type: "article",
      url: canonical(appBaseUrl, `/articles/${dto.slug}`),
      ...(image === null ? {} : { images: [image] }),
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
  const image = safeAbsoluteImage(dto.featuredImageUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: dto.title,
    description: eligible.description,
    mainEntityOfPage: eligible.canonical,
    datePublished: dto.publishedAt!,
    dateModified: dto.updatedAt,
    ...(image === null ? {} : { image }),
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
        name: "Home",
        item: canonical(appBaseUrl, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
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
