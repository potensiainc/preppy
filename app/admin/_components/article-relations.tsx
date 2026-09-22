"use client";

import { useEffect, useState } from "react";

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

function mergeOptions(
  first: readonly ArticleRelationOptionDTO[],
  second: readonly ArticleRelationOptionDTO[],
): readonly ArticleRelationOptionDTO[] {
  return [
    ...new Map([...first, ...second].map((item) => [item.id, item])).values(),
  ];
}

export function ArticleRelations(props: RelationProps) {
  const [message, setMessage] = useState("");
  const [isStale, setIsStale] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [institutionResults, setInstitutionResults] = useState(
    props.institutionOptions,
  );
  const [opportunityResults, setOpportunityResults] = useState(
    props.opportunityOptions,
  );
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ kind: "institution" });
      if (institutionQuery.trim() !== "")
        params.set("query", institutionQuery.trim());
      try {
        const response = await fetch(
          `/api/admin/articles/relation-options?${params}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("institution search failed");
        const payload = (await response.json()) as {
          data: { items: ArticleRelationOptionDTO[] };
        };
        setInstitutionResults(payload.data.items);
        setSearchMessage("");
      } catch (error) {
        if (!controller.signal.aborted)
          setSearchMessage(
            "기관 검색 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [institutionQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ kind: "opportunity" });
      if (opportunityQuery.trim() !== "")
        params.set("query", opportunityQuery.trim());
      try {
        const response = await fetch(
          `/api/admin/articles/relation-options?${params}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("opportunity search failed");
        const payload = (await response.json()) as {
          data: { items: ArticleRelationOptionDTO[] };
        };
        setOpportunityResults(payload.data.items);
        setSearchMessage("");
      } catch (error) {
        if (!controller.signal.aborted)
          setSearchMessage(
            "입학정보 검색 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [opportunityQuery]);
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
    setIsBusy(true);
    setMessage("연결 정보를 저장하고 있어요.");
    try {
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
      const payload = (await response.json()) as {
        data: { updatedAt: string };
      };
      props.onUpdated(payload.data.updatedAt);
      setIsStale(false);
      setMessage("연결 정보를 저장했어요.");
    } finally {
      setIsBusy(false);
    }
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
              ? mergeOptions(props.institutionOptions, institutionResults)
              : mergeOptions(props.opportunityOptions, opportunityResults);
          const selected =
            label === "Institution"
              ? props.institutionIds
              : props.opportunityIds;
          const kind =
            label === "Institution" ? "institutionIds" : "opportunityIds";
          const query =
            label === "Institution" ? institutionQuery : opportunityQuery;
          const setQuery =
            label === "Institution" ? setInstitutionQuery : setOpportunityQuery;
          const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
          const visibleOptions = options.filter((option) =>
            normalizedQuery === ""
              ? true
              : `${option.label} ${option.slug}`
                  .toLocaleLowerCase("ko-KR")
                  .includes(normalizedQuery),
          );
          const selectedOptions = options.filter((option) =>
            selected.includes(option.id),
          );
          return (
            <fieldset key={label}>
              <legend>
                {label === "Opportunity" ? "입학정보" : "기관"} ·{" "}
                {selected.length}개 선택
              </legend>
              <label className="admin-relation-search">
                {label === "Opportunity" ? "입학정보 검색" : "기관 검색"}
                <input
                  type="search"
                  value={query}
                  placeholder={
                    label === "Opportunity"
                      ? "제목 또는 주소 이름"
                      : "기관명 또는 주소 이름"
                  }
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {selectedOptions.length > 0 ? (
                <div className="admin-selected-relations" aria-label="선택됨">
                  <strong>선택됨</strong>
                  {selectedOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!props.editable}
                      onClick={() => toggle(kind, option.id)}
                    >
                      {option.label} <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="admin-relation-empty">
                  아직 선택한 항목이 없어요.
                </p>
              )}
              <div className="admin-relation-results">
                {visibleOptions.map((option) => (
                  <label key={option.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      disabled={!props.editable}
                      onChange={() => toggle(kind, option.id)}
                    />
                    <span>
                      {option.label}
                      <small>{option.slug}</small>
                    </span>
                  </label>
                ))}
                {visibleOptions.length === 0 ? (
                  <p className="admin-relation-empty">검색 결과가 없어요.</p>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </div>
      <p className="admin-form-status" role="status" aria-live="polite">
        {searchMessage}
      </p>
      {props.editable ? (
        <button type="button" disabled={isBusy} onClick={() => void save()}>
          {isBusy ? "저장 중" : "연결 정보 저장"}
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
