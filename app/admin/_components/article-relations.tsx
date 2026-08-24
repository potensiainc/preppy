"use client";

import { useState } from "react";

import type { ArticleRelationOptionDTO } from "@/src/modules/admin/read-model/contracts";

const staleMessage =
  "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.";

type RelationProps = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  editable: boolean;
  institutionOptions: readonly ArticleRelationOptionDTO[];
  opportunityOptions: readonly ArticleRelationOptionDTO[];
  institutionIds: readonly string[];
  opportunityIds: readonly string[];
  onChange: (
    next: Readonly<{
      institutionIds: readonly string[];
      opportunityIds: readonly string[];
    }>,
  ) => void;
  onUpdated: (updatedAt: string) => void;
}>;

export function ArticleRelations(props: RelationProps) {
  const [message, setMessage] = useState("");
  const [isStale, setIsStale] = useState(false);
  const toggle = (kind: "institutionIds" | "opportunityIds", id: string) => {
    const current = props[kind];
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    props.onChange({
      institutionIds: kind === "institutionIds" ? next : props.institutionIds,
      opportunityIds: kind === "opportunityIds" ? next : props.opportunityIds,
    });
  };
  const save = async () => {
    const response = await fetch(
      `/api/admin/articles/${props.articleId}/relations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: props.expectedUpdatedAt,
          institutionIds: props.institutionIds,
          opportunityIds: props.opportunityIds,
        }),
      },
    );
    if (response.status === 409) {
      setMessage(staleMessage);
      setIsStale(true);
      return;
    }
    if (!response.ok) {
      setMessage("Could not save Article relations.");
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    props.onUpdated(payload.data.updatedAt);
    setIsStale(false);
    setMessage("Relations saved.");
  };

  return (
    <section
      className="admin-article-relations"
      aria-labelledby="article-relations-heading"
    >
      <h2 id="article-relations-heading">Canonical relations</h2>
      <p>
        Selections are complete replacement sets. Published changes are
        committed with Publish Changes.
      </p>
      <div className="admin-article-relation-grid">
        {(["Institution", "Opportunity"] as const).map((label) => {
          const options =
            label === "Institution"
              ? props.institutionOptions
              : props.opportunityOptions;
          const selected =
            label === "Institution"
              ? props.institutionIds
              : props.opportunityIds;
          const kind =
            label === "Institution" ? "institutionIds" : "opportunityIds";
          return (
            <fieldset key={label}>
              <legend>
                {label === "Opportunity" ? "Opportunities" : "Institutions"}
              </legend>
              {options.map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option.id)}
                    onChange={() => toggle(kind, option.id)}
                  />
                  <span>
                    {option.label}
                    <small>{option.slug}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      {props.editable ? (
        <button type="button" onClick={() => void save()}>
          Save Relations
        </button>
      ) : (
        <p className="admin-warning">
          Unpublish before saving relations separately.
        </p>
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
