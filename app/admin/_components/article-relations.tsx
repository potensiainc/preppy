"use client";

import { useState } from "react";

import type { ArticleRelationOptionDTO } from "@/src/modules/admin/read-model/contracts";

const staleMessage =
  "다른 운영자가 먼저 변경했을 수 있어요. 최신 데이터를 다시 불러와 확인한 뒤 수정해 주세요.";

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
      setMessage(
        "연결 정보를 저장하지 못했어요. 현재 발행 상태와 선택한 항목을 확인해 주세요.",
      );
      return;
    }
    const payload = (await response.json()) as { data: { updatedAt: string } };
    props.onUpdated(payload.data.updatedAt);
    setIsStale(false);
    setMessage("연결 정보를 저장했어요.");
  };

  return (
    <section
      className="admin-article-relations"
      aria-labelledby="article-relations-heading"
    >
      <h2 id="article-relations-heading">연결 정보</h2>
      <p>
        선택한 항목으로 연결 정보 전체를 교체해요. 발행된 아티클은 ‘변경 내용
        발행’을 눌러 반영해 주세요.
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
              <legend>{label === "Opportunity" ? "입학정보" : "기관"}</legend>
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
          연결 정보 저장
        </button>
      ) : (
        <p className="admin-warning">
          연결 정보만 따로 저장하려면 먼저 발행을 취소해 주세요.
        </p>
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
