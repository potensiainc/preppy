"use client";

import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ArticleEditorToolbar } from "@/app/admin/_components/article-editor-toolbar";
import { ArticleLifecycleActions } from "@/app/admin/_components/article-lifecycle-actions";
import { ArticleRelations } from "@/app/admin/_components/article-relations";
import {
  ARTICLE_CATEGORY_OPTIONS,
  ARTICLE_FIELD_LIMITS,
  ARTICLE_TYPE_OPTIONS,
} from "@/app/admin/_lib/article-labels";
import {
  ARTICLE_TAG_MAX_CODE_POINTS,
  ARTICLE_TAG_MAX_ITEMS,
  normalizeArticleTag,
  normalizeArticleTags,
  parseArticleTagInput,
} from "@/src/modules/editorial/tags";
import type {
  AdminArticleDetailDTO,
  ArticleRelationOptionDTO,
} from "@/src/modules/admin/read-model/contracts";

const staleMessage =
  "다른 운영자가 먼저 변경했을 수 있어요. 최신 데이터를 다시 불러와 확인한 뒤 수정해 주세요.";

type Candidate = Readonly<{
  title: string;
  type: "GUIDE" | "UPDATE" | "ROUNDUP";
  category:
    | "ENGLISH_KINDERGARTEN"
    | "PRIVATE_ELEMENTARY"
    | "INTERNATIONAL_SCHOOL"
    | "ADMISSIONS_GENERAL";
  excerpt: string | null;
  contentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  tags: readonly string[];
}>;

const nullable = (value: string) => (value.trim() === "" ? null : value);

const codePointLength = (value: string) => [...value].length;

function htmlTextLength(html: string): number {
  if (typeof DOMParser === "undefined") return 0;
  const text =
    new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  return [...text].filter((character) => !/\s/u.test(character)).length;
}

type ErrorPayload = { error?: { code?: string } };

async function responseErrorCode(response: Response): Promise<string | null> {
  try {
    return ((await response.json()) as ErrorPayload).error?.code ?? null;
  } catch {
    return null;
  }
}

function SearchPreview({
  title,
  description,
  slug,
}: Readonly<{ title: string; description: string; slug: string }>) {
  const cut = (value: string, max: number) =>
    codePointLength(value) > max
      ? `${[...value].slice(0, max - 1).join("")}…`
      : value;
  return (
    <div className="admin-search-preview" aria-label="검색 결과 미리보기">
      <small>구글 검색 결과 미리보기 (대략)</small>
      <span className="admin-search-preview__url">
        PREPPY › articles › {slug}
      </span>
      <strong className="admin-search-preview__title">
        {cut(title.trim() || "제목을 입력해 주세요", 34)}
      </strong>
      <span className="admin-search-preview__description">
        {cut(
          description.trim() || "검색 설명이나 요약을 입력하면 여기에 보여요.",
          90,
        )}
      </span>
    </div>
  );
}

function FieldCounter({
  value,
  max,
}: Readonly<{ value: string; max: number }>) {
  const length = codePointLength(value);
  return (
    <small
      className={
        length > max ? "admin-field-counter is-over" : "admin-field-counter"
      }
    >
      {length}/{max}
    </small>
  );
}

export function AdminNewArticleEditor() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <form
      className="admin-article-create"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const response = await fetch("/api/admin/articles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: data.get("slug"),
            title: data.get("title"),
            type: data.get("type"),
            category: data.get("category"),
          }),
        });
        if (!response.ok) {
          const code = await responseErrorCode(response);
          setMessage(
            code === "CONFLICT"
              ? "같은 주소 이름(slug)의 아티클이 이미 있어요. 다른 주소 이름을 입력해 주세요."
              : "초안을 만들지 못했어요. 주소 이름은 영문 소문자·숫자·하이픈(-)만 쓸 수 있어요.",
          );
          return;
        }
        const payload = (await response.json()) as {
          data: { articleId: string };
        };
        router.push(`/admin/articles/${payload.data.articleId}`);
      }}
    >
      <label>
        주소 이름(slug)
        <input
          name="slug"
          required
          maxLength={120}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="예: 2027-private-elementary-schedule"
          title="영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요."
        />
        <small>글 주소가 돼요: /articles/주소-이름</small>
      </label>
      <label>
        제목
        <input name="title" required maxLength={ARTICLE_FIELD_LIMITS.title} />
      </label>
      <label>
        유형
        <select name="type" defaultValue="GUIDE">
          {ARTICLE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        분류
        <select name="category" defaultValue="ADMISSIONS_GENERAL">
          {ARTICLE_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">초안 만들기</button>
      <p className="admin-form-status" role="status">
        {message}
      </p>
    </form>
  );
}

export function AdminArticleEditor({
  article,
  institutionOptions,
  opportunityOptions,
}: Readonly<{
  article: AdminArticleDetailDTO;
  institutionOptions: readonly ArticleRelationOptionDTO[];
  opportunityOptions: readonly ArticleRelationOptionDTO[];
}>) {
  const initialSanitizedContentHtml = article.sanitizedContentHtml;
  const router = useRouter();
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const [sourceHtml, setSourceHtml] = useState(initialSanitizedContentHtml);
  const [updatedAt, setUpdatedAt] = useState(article.updatedAt);
  const [institutionIds, setInstitutionIds] = useState<readonly string[]>(
    article.institutionIds,
  );
  const [opportunityIds, setOpportunityIds] = useState<readonly string[]>(
    article.opportunityIds,
  );
  const [fields, setFields] = useState({
    title: article.title,
    type: article.type,
    category: article.category,
    excerpt: article.excerpt ?? "",
    seoTitle: article.seoTitle ?? "",
    seoDescription: article.seoDescription ?? "",
    canonicalUrl: article.canonicalUrl ?? "",
    robotsIndex: article.robotsIndex,
    robotsFollow: article.robotsFollow,
    featuredImageUrl: article.featuredImageUrl ?? "",
    featuredImageAlt: article.featuredImageAlt ?? "",
    tags: article.tags.join(", "),
  });
  const [message, setMessage] = useState("");
  const [isStale, setIsStale] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: false },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: initialSanitizedContentHtml,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: current }) => {
      setSourceHtml(current.getHTML());
      setIsDirty(true);
    },
  });

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const switchMode = (next: "visual" | "source") => {
    if (!editor) return;
    const wasDirty = isDirty;
    if (next === "source") setSourceHtml(editor.getHTML());
    else editor.commands.setContent(sourceHtml, { emitUpdate: true });
    // Switching modes only re-renders the same content; keep the dirty flag.
    setIsDirty(wasDirty);
    setMode(next);
  };
  const candidate = (): Candidate => ({
    title: fields.title,
    type: fields.type,
    category: fields.category,
    excerpt: nullable(fields.excerpt),
    contentHtml:
      mode === "source" ? sourceHtml : (editor?.getHTML() ?? sourceHtml),
    seoTitle: nullable(fields.seoTitle),
    seoDescription: nullable(fields.seoDescription),
    canonicalUrl: nullable(fields.canonicalUrl),
    robotsIndex: fields.robotsIndex,
    robotsFollow: fields.robotsFollow,
    featuredImageUrl: nullable(fields.featuredImageUrl),
    featuredImageAlt: nullable(fields.featuredImageAlt),
    tags: normalizeArticleTags(parseArticleTagInput(fields.tags)),
  });
  const publishProblems = (): string[] => {
    const current = candidate();
    const problems: string[] = [];
    if (current.title.trim() === "") problems.push("제목을 입력해 주세요.");
    if (current.excerpt === null && current.seoDescription === null)
      problems.push("요약 또는 검색 설명 중 하나를 입력해 주세요.");
    const bodyLength = htmlTextLength(current.contentHtml);
    if (bodyLength < ARTICLE_FIELD_LIMITS.minBodyCharacters)
      problems.push(
        `본문을 공백 제외 ${ARTICLE_FIELD_LIMITS.minBodyCharacters}자 이상 써 주세요. (현재 ${bodyLength}자)`,
      );
    if (
      current.canonicalUrl !== null &&
      !current.canonicalUrl
        .replace(/\/$/u, "")
        .endsWith(`/articles/${article.slug}`)
    )
      problems.push(
        "대표 URL은 비워 두세요. 비워 두면 이 글 주소로 자동 설정돼요.",
      );
    return problems;
  };
  const fieldProblems = (): string[] => {
    const limits: Array<[string, string, number]> = [
      ["제목", fields.title, ARTICLE_FIELD_LIMITS.title],
      ["요약", fields.excerpt, ARTICLE_FIELD_LIMITS.excerpt],
      ["검색 제목", fields.seoTitle, ARTICLE_FIELD_LIMITS.seoTitle],
      ["검색 설명", fields.seoDescription, ARTICLE_FIELD_LIMITS.seoDescription],
      [
        "대표 이미지 대체 텍스트",
        fields.featuredImageAlt,
        ARTICLE_FIELD_LIMITS.imageAlt,
      ],
    ];
    const problems = limits
      .filter(([, value, max]) => codePointLength(value) > max)
      .map(([label, , max]) => `${label}은(는) ${max}자 이하로 줄여 주세요.`);
    const rawTags = parseArticleTagInput(fields.tags);
    const invalid = rawTags.filter((tag) => normalizeArticleTag(tag) === null);
    if (invalid.length > 0)
      problems.push(
        `태그를 확인해 주세요: ${invalid.join(", ")} (글자·숫자·공백만, ${ARTICLE_TAG_MAX_CODE_POINTS}자 이하)`,
      );
    if (normalizeArticleTags(rawTags).length > ARTICLE_TAG_MAX_ITEMS)
      problems.push(`태그는 최대 ${ARTICLE_TAG_MAX_ITEMS}개까지 쓸 수 있어요.`);
    return problems;
  };
  const submit = async (intent: "SAVE_DRAFT" | "PUBLISH") => {
    if (isSaving) return;
    const publish = intent === "PUBLISH";
    const problems = [
      ...fieldProblems(),
      ...(publish ? publishProblems() : []),
    ];
    if (problems.length > 0) {
      setMessage(
        `${publish ? "발행" : "저장"}하려면 확인이 필요해요. ${problems.join(" ")}`,
      );
      return;
    }
    setIsStale(false);
    setIsSaving(true);
    const response = await fetch(
      `/api/admin/articles/${article.id}/${publish ? "publish" : "draft"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: updatedAt,
          candidate: publish
            ? { ...candidate(), institutionIds, opportunityIds }
            : candidate(),
        }),
      },
    )
      .catch(() => null)
      .finally(() => setIsSaving(false));
    if (response === null) {
      setMessage(
        "네트워크 연결을 확인한 뒤 다시 시도해 주세요. 입력 내용은 화면에 남아 있어요.",
      );
      return;
    }
    if (response.status === 409) {
      setMessage(staleMessage);
      setIsStale(true);
      return;
    }
    if (!response.ok) {
      const code = await responseErrorCode(response);
      setMessage(
        code === "NOT_ELIGIBLE"
          ? publish
            ? "발행 조건을 확인해 주세요. 본문 공백 제외 40자 이상, 요약 또는 검색 설명 입력, 대표 URL은 비워 두기, 연결 기관·입학정보는 공개된 항목만 가능해요."
            : "현재 상태에서는 초안으로 저장할 수 없어요. 발행된 글은 ‘변경 내용 발행’으로 저장해 주세요."
          : code === "VALIDATION_ERROR"
            ? "입력 형식을 확인해 주세요. 글자 수 제한과 이미지 URL(https://로 시작) 형식을 확인해 주세요."
            : "입력 내용을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    setUpdatedAt(payload.data.updatedAt);
    setIsDirty(false);
    setMessage(publish ? "발행했어요." : "입력 내용을 저장했어요.");
    router.refresh();
  };
  const saveShortcut = useRef(submit);
  useEffect(() => {
    saveShortcut.current = submit;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (article.status === "DRAFT" || article.status === "UNPUBLISHED")
          void saveShortcut.current("SAVE_DRAFT");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [article.status]);
  const set = <K extends keyof typeof fields>(
    key: K,
    value: (typeof fields)[K],
  ) => {
    setFields((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
  };

  return (
    <div className="admin-article-workbench">
      <div className="admin-article-form-grid">
        <label>
          제목
          <input
            value={fields.title}
            onChange={(event) => set("title", event.target.value)}
          />
          <FieldCounter value={fields.title} max={ARTICLE_FIELD_LIMITS.title} />
        </label>
        <label>
          유형
          <select
            value={fields.type}
            onChange={(event) =>
              set("type", event.target.value as typeof fields.type)
            }
          >
            {ARTICLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          분류
          <select
            value={fields.category}
            onChange={(event) =>
              set("category", event.target.value as typeof fields.category)
            }
          >
            {ARTICLE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          요약
          <textarea
            value={fields.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
          />
          <FieldCounter
            value={fields.excerpt}
            max={ARTICLE_FIELD_LIMITS.excerpt}
          />
        </label>
        <label>
          검색 제목
          <input
            value={fields.seoTitle}
            onChange={(event) => set("seoTitle", event.target.value)}
          />
          <FieldCounter
            value={fields.seoTitle}
            max={ARTICLE_FIELD_LIMITS.seoTitle}
          />
        </label>
        <label>
          검색 설명
          <textarea
            value={fields.seoDescription}
            onChange={(event) => set("seoDescription", event.target.value)}
          />
          <FieldCounter
            value={fields.seoDescription}
            max={ARTICLE_FIELD_LIMITS.seoDescription}
          />
        </label>
        <label>
          대표 URL
          <input
            type="url"
            value={fields.canonicalUrl}
            placeholder="비워 두면 이 글 주소로 자동 설정돼요"
            onChange={(event) => set("canonicalUrl", event.target.value)}
          />
        </label>
        <label>
          대표 이미지 URL
          <input
            type="url"
            value={fields.featuredImageUrl}
            placeholder="https://로 시작하는 이미지 주소"
            onChange={(event) => set("featuredImageUrl", event.target.value)}
          />
        </label>
        <label>
          대표 이미지 대체 텍스트
          <input
            value={fields.featuredImageAlt}
            onChange={(event) => set("featuredImageAlt", event.target.value)}
          />
          <small>
            공유 이미지는 1200×630으로 자동 변환돼요. 원본이 잘리지 않도록
            가운데에 맞춰 넣어요.
          </small>
        </label>
        <label>
          태그
          <input
            value={fields.tags}
            placeholder="예: 강남 영유, 추가모집, 레벨테스트"
            onChange={(event) => set("tags", event.target.value)}
          />
          <small>
            쉼표로 구분해요. 최대 {ARTICLE_TAG_MAX_ITEMS}개 · 태그마다 모아보기
            페이지가 생겨요. (
            {normalizeArticleTags(parseArticleTagInput(fields.tags)).length}/
            {ARTICLE_TAG_MAX_ITEMS})
          </small>
        </label>
        <SearchPreview
          title={fields.seoTitle || fields.title}
          description={fields.seoDescription || fields.excerpt}
          slug={article.slug}
        />
        <label className="admin-article-check">
          <input
            type="checkbox"
            checked={fields.robotsIndex}
            onChange={(event) => set("robotsIndex", event.target.checked)}
          />
          검색 색인 허용
        </label>
        <label className="admin-article-check">
          <input
            type="checkbox"
            checked={fields.robotsFollow}
            onChange={(event) => set("robotsFollow", event.target.checked)}
          />
          검색 로봇 링크 추적 허용
        </label>
      </div>
      <section
        className="admin-article-editor"
        aria-labelledby="article-body-heading"
      >
        <div className="admin-section-heading">
          <h2 id="article-body-heading">본문 편집</h2>
          <div className="admin-article-mode">
            <button
              type="button"
              aria-pressed={mode === "visual"}
              onClick={() => switchMode("visual")}
            >
              화면 편집
            </button>
            <button
              type="button"
              aria-pressed={mode === "source"}
              onClick={() => switchMode("source")}
            >
              HTML 편집
            </button>
          </div>
        </div>
        {editor && mode === "visual" && (
          <>
            <ArticleEditorToolbar editor={editor} />
            <EditorContent editor={editor} />
          </>
        )}
        {mode === "source" && (
          <label>
            본문 HTML
            <textarea
              className="admin-article-source"
              value={sourceHtml}
              onChange={(event) => {
                setSourceHtml(event.target.value);
                setIsDirty(true);
              }}
            />
            <small>저장할 때 안전하지 않은 HTML 요소가 제거될 수 있어요.</small>
          </label>
        )}
      </section>
      <div className="admin-article-submit-actions">
        {article.status !== "PUBLISHED" && article.status !== "ARCHIVED" ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void submit("SAVE_DRAFT")}
          >
            초안 저장 (Ctrl+S)
          </button>
        ) : null}
        {article.status !== "ARCHIVED" ? (
          <button
            className="admin-article-primary"
            type="button"
            disabled={isSaving}
            onClick={() => void submit("PUBLISH")}
          >
            {article.status === "PUBLISHED" ? "변경 내용 발행" : "아티클 발행"}
          </button>
        ) : null}
      </div>
      <p className="admin-form-status" role="status" aria-live="polite">
        {isDirty && message === ""
          ? "저장하지 않은 변경 내용이 있어요."
          : message}
      </p>
      {isStale ? (
        <button type="button" onClick={() => window.location.reload()}>
          최신 데이터 다시 불러오기
        </button>
      ) : null}
      <ArticleRelations
        articleId={article.id}
        expectedUpdatedAt={updatedAt}
        editable={
          article.status === "DRAFT" || article.status === "UNPUBLISHED"
        }
        institutionOptions={institutionOptions}
        opportunityOptions={opportunityOptions}
        institutionIds={institutionIds}
        opportunityIds={opportunityIds}
        onChange={(next) => {
          setInstitutionIds(next.institutionIds);
          setOpportunityIds(next.opportunityIds);
        }}
        onUpdated={setUpdatedAt}
      />
      <ArticleLifecycleActions
        articleId={article.id}
        status={article.status}
        expectedUpdatedAt={updatedAt}
        onUpdated={setUpdatedAt}
      />
    </div>
  );
}
