"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ArticleEditorToolbar } from "@/app/admin/_components/article-editor-toolbar";
import { ArticleLifecycleActions } from "@/app/admin/_components/article-lifecycle-actions";
import { ArticleRelations } from "@/app/admin/_components/article-relations";
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
}>;

const nullable = (value: string) => (value.trim() === "" ? null : value);

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
          setMessage(
            "초안을 만들지 못했어요. 입력 내용을 확인한 뒤 다시 시도해 주세요.",
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
        <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
      </label>
      <label>
        제목
        <input name="title" required maxLength={160} />
      </label>
      <label>
        유형
        <select name="type" defaultValue="GUIDE">
          <option>GUIDE</option>
          <option>UPDATE</option>
          <option>ROUNDUP</option>
        </select>
      </label>
      <label>
        분류
        <select name="category" defaultValue="ADMISSIONS_GENERAL">
          <option>ADMISSIONS_GENERAL</option>
          <option>ENGLISH_KINDERGARTEN</option>
          <option>PRIVATE_ELEMENTARY</option>
          <option>INTERNATIONAL_SCHOOL</option>
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
  });
  const [message, setMessage] = useState("");
  const [isStale, setIsStale] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: false },
      }),
    ],
    content: initialSanitizedContentHtml,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => setSourceHtml(current.getHTML()),
  });

  const switchMode = (next: "visual" | "source") => {
    if (!editor) return;
    if (next === "source") setSourceHtml(editor.getHTML());
    else editor.commands.setContent(sourceHtml, { emitUpdate: true });
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
  });
  const submit = async (intent: "SAVE_DRAFT" | "PUBLISH") => {
    const publish = intent === "PUBLISH";
    setIsStale(false);
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
    );
    if (response.status === 409) {
      setMessage(staleMessage);
      setIsStale(true);
      return;
    }
    if (!response.ok) {
      setMessage(
        "입력 내용을 저장하지 못했어요. 입력값과 현재 발행 상태를 확인해 주세요.",
      );
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    setUpdatedAt(payload.data.updatedAt);
    setMessage("입력 내용을 저장했어요.");
    router.refresh();
  };
  const set = <K extends keyof typeof fields>(
    key: K,
    value: (typeof fields)[K],
  ) => setFields((current) => ({ ...current, [key]: value }));

  return (
    <div className="admin-article-workbench">
      <div className="admin-article-form-grid">
        <label>
          제목
          <input
            value={fields.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
        <label>
          유형
          <select
            value={fields.type}
            onChange={(event) =>
              set("type", event.target.value as typeof fields.type)
            }
          >
            <option>GUIDE</option>
            <option>UPDATE</option>
            <option>ROUNDUP</option>
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
            <option>ADMISSIONS_GENERAL</option>
            <option>ENGLISH_KINDERGARTEN</option>
            <option>PRIVATE_ELEMENTARY</option>
            <option>INTERNATIONAL_SCHOOL</option>
          </select>
        </label>
        <label>
          요약
          <textarea
            value={fields.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
          />
        </label>
        <label>
          검색 제목
          <input
            value={fields.seoTitle}
            onChange={(event) => set("seoTitle", event.target.value)}
          />
        </label>
        <label>
          검색 설명
          <textarea
            value={fields.seoDescription}
            onChange={(event) => set("seoDescription", event.target.value)}
          />
        </label>
        <label>
          대표 URL
          <input
            type="url"
            value={fields.canonicalUrl}
            onChange={(event) => set("canonicalUrl", event.target.value)}
          />
        </label>
        <label>
          대표 이미지 URL
          <input
            type="url"
            value={fields.featuredImageUrl}
            onChange={(event) => set("featuredImageUrl", event.target.value)}
          />
        </label>
        <label>
          대표 이미지 대체 텍스트
          <input
            value={fields.featuredImageAlt}
            onChange={(event) => set("featuredImageAlt", event.target.value)}
          />
        </label>
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
              onChange={(event) => setSourceHtml(event.target.value)}
            />
            <small>저장할 때 안전하지 않은 HTML 요소가 제거될 수 있어요.</small>
          </label>
        )}
      </section>
      <div className="admin-article-submit-actions">
        {article.status !== "PUBLISHED" && article.status !== "ARCHIVED" ? (
          <button type="button" onClick={() => void submit("SAVE_DRAFT")}>
            초안 저장
          </button>
        ) : null}
        {article.status !== "ARCHIVED" ? (
          <button
            className="admin-article-primary"
            type="button"
            onClick={() => void submit("PUBLISH")}
          >
            {article.status === "PUBLISHED" ? "변경 내용 발행" : "아티클 발행"}
          </button>
        ) : null}
      </div>
      <p className="admin-form-status" role="status" aria-live="polite">
        {message}
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
