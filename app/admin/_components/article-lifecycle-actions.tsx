"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const staleMessage =
  "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.";

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
      setMessage("The lifecycle command was rejected. Review current state.");
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    onUpdated(payload.data.updatedAt);
    setIsStale(false);
    setMessage("Command completed.");
    router.refresh();
  };

  return (
    <section
      className="admin-article-lifecycle"
      aria-labelledby="article-lifecycle-heading"
    >
      <h2 id="article-lifecycle-heading">Lifecycle controls</h2>
      <div className="admin-article-lifecycle__actions">
        {status === "PUBLISHED" && (
          <button type="button" onClick={() => void command("unpublish", {})}>
            Unpublish
          </button>
        )}
        {status !== "ARCHIVED" && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Archive this Article? This is an explicit lifecycle action.",
                )
              )
                void command("archive", {});
            }}
          >
            Archive
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
          <label htmlFor="article-new-slug">Change slug</label>
          <input
            id="article-new-slug"
            value={newSlug}
            onChange={(event) => setNewSlug(event.target.value)}
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          />
          <p className="admin-warning">
            A published history change creates a permanent redirect registry
            entry.
          </p>
          <button type="submit">Change slug</button>
        </form>
      )}
      <p className="admin-form-status" role="status" aria-live="polite">
        {message}
      </p>
      {isStale ? (
        <button type="button" onClick={() => window.location.reload()}>
          Reload latest data
        </button>
      ) : null}
    </section>
  );
}
