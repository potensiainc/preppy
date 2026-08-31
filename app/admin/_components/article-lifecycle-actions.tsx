"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const staleMessage =
  "다른 운영자가 먼저 변경했을 수 있어요. 최신 데이터를 다시 불러와 확인한 뒤 수정해 주세요.";

export function ArticleLifecycleActions({
  articleId,
  status,
  expectedUpdatedAt,
  onUpdated,
}: Readonly<{
  articleId: string;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  expectedUpdatedAt: string;
  onUpdated: (updatedAt: string) => void;
}>) {
  const router = useRouter();
  const [newSlug, setNewSlug] = useState("");
  const [message, setMessage] = useState("");
  const [isStale, setIsStale] = useState(false);

  const command = async (
    action: "unpublish" | "archive" | "change-slug",
    body: Record<string, unknown>,
  ) => {
    const response = await fetch(`/api/admin/articles/${articleId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt, ...body }),
    });
    if (response.status === 409) {
      setMessage(staleMessage);
      setIsStale(true);
      return;
    }
    if (!response.ok) {
      setMessage("상태를 변경하지 못했어요. 현재 발행 상태를 확인해 주세요.");
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    onUpdated(payload.data.updatedAt);
    setIsStale(false);
    setMessage("요청을 반영했어요.");
    router.refresh();
  };

  return (
    <section
      className="admin-article-lifecycle"
      aria-labelledby="article-lifecycle-heading"
    >
      <h2 id="article-lifecycle-heading">발행 상태 관리</h2>
      <div className="admin-article-lifecycle__actions">
        {status === "PUBLISHED" && (
          <button type="button" onClick={() => void command("unpublish", {})}>
            발행 취소
          </button>
        )}
        {status !== "ARCHIVED" && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "이 아티클을 보관 처리할까요? 보관 상태로 변경돼요.",
                )
              )
                void command("archive", {});
            }}
          >
            보관 처리
          </button>
        )}
      </div>
      {status !== "ARCHIVED" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command("change-slug", { newSlug });
          }}
        >
          <label htmlFor="article-new-slug">주소 이름 변경</label>
          <input
            id="article-new-slug"
            value={newSlug}
            onChange={(event) => setNewSlug(event.target.value)}
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <p className="admin-warning">
            발행 이력이 있는 아티클의 주소 이름을 바꾸면 영구 리디렉션이
            등록돼요.
          </p>
          <button type="submit">주소 이름 변경</button>
        </form>
      )}
      <p className="admin-form-status" role="status" aria-live="polite">
        {message}
      </p>
      {isStale ? (
        <button type="button" onClick={() => window.location.reload()}>
          최신 데이터 다시 불러오기
        </button>
      ) : null}
    </section>
  );
}
