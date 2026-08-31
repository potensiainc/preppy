"use client";

import { useState, type FormEvent } from "react";

import { isCanonicalAdminActionUrl } from "@/src/modules/admin/action-url";

export type SubmitSourceAction = (
  endpoint: string,
  method: "POST" | "DELETE",
  body: unknown | (() => unknown),
) => Promise<void>;

function requiredTrimmed(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("필수 출처 정보를 입력해 주세요.");
  }
  return value.trim();
}

function canonicalSourceUrl(form: FormData, name: string): string {
  const value = requiredTrimmed(form, name);
  if (!isCanonicalAdminActionUrl(value) || new URL(value).hash !== "") {
    throw new Error(
      "출처 URL은 fragment(# 뒤의 부분) 없는 정확한 HTTP(S) 주소로 입력해 주세요.",
    );
  }
  return value;
}

export function buildUrlCorrectionBody(form: FormData) {
  if (form.get("provenanceContinuityConfirmed") !== "true") {
    throw new Error(
      "같은 공식 출처가 이어지는지 확인하고 확인란을 선택해 주세요.",
    );
  }
  return {
    moveMode: "URL_CORRECTION" as const,
    newUrl: canonicalSourceUrl(form, "newUrl"),
    provenanceContinuityConfirmed: true as const,
  };
}

export function buildSourceReplacementBody(
  replacementKind: "CREATE" | "REUSE",
  form: FormData,
) {
  if (form.get("replacementConfirmed") !== "true") {
    throw new Error("다른 출처로 교체하는지 확인하고 확인란을 선택해 주세요.");
  }
  return {
    moveMode: "SOURCE_REPLACEMENT" as const,
    replacement:
      replacementKind === "CREATE"
        ? {
            kind: "CREATE" as const,
            canonicalUrl: canonicalSourceUrl(form, "canonicalUrl"),
            sourceName: requiredTrimmed(form, "sourceName"),
          }
        : {
            kind: "REUSE" as const,
            replacementSourceId: requiredTrimmed(form, "replacementSourceId"),
          },
  };
}

export function SourceMoveActions({
  sourceId,
  sourceName,
  canonicalUrl,
  submitAction,
}: {
  sourceId: string;
  sourceName: string;
  canonicalUrl: string;
  submitAction: SubmitSourceAction;
}) {
  const [replacementKind, setReplacementKind] = useState<"CREATE" | "REUSE">(
    "CREATE",
  );
  const [correctionPending, setCorrectionPending] = useState(false);
  const [replacementPending, setReplacementPending] = useState(false);

  async function submitUrlCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCorrectionPending(true);
    try {
      await submitAction(
        `/api/admin/sources/${encodeURIComponent(sourceId)}/moved`,
        "POST",
        () => buildUrlCorrectionBody(new FormData(form)),
      );
    } finally {
      setCorrectionPending(false);
    }
  }

  async function submitSourceReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setReplacementPending(true);
    try {
      await submitAction(
        `/api/admin/sources/${encodeURIComponent(sourceId)}/moved`,
        "POST",
        () => buildSourceReplacementBody(replacementKind, new FormData(form)),
      );
    } finally {
      setReplacementPending(false);
    }
  }

  return (
    <section
      className="admin-source-move"
      aria-labelledby="source-move-heading"
    >
      <div className="admin-section-heading">
        <h2 id="source-move-heading">출처 주소 관리</h2>
      </div>
      <p className="admin-callout">
        주소 수정과 출처 교체 중 직접 선택해 주세요. 같은 공식 출처가
        이어지는지는 PREPPY가 추정하지 않아요.
      </p>
      <div className="admin-source-move__modes">
        <form
          className="admin-action-card admin-action-card--correction"
          onSubmit={submitUrlCorrection}
        >
          <p className="admin-action-code">URL_CORRECTION</p>
          <h3>URL 수정</h3>
          <p id="url-correction-description">
            <strong>{sourceName}</strong>의 대표 URL만 수정해요. 동일한 출처
            기록은 유지해요.
          </p>
          <label htmlFor="source-correction-url">
            새 공식 URL
            <input
              id="source-correction-url"
              name="newUrl"
              type="url"
              required
              defaultValue={canonicalUrl}
              aria-describedby="url-correction-description"
            />
          </label>
          <label
            className="admin-confirmation"
            htmlFor="source-same-provenance"
          >
            <input
              id="source-same-provenance"
              name="provenanceContinuityConfirmed"
              type="checkbox"
              value="true"
              required
            />
            같은 공식 출처이며 동일한 출처 기록을 유지하는 변경임을 확인했어요.
          </label>
          <button type="submit" disabled={correctionPending}>
            {correctionPending ? "URL 수정 중…" : "URL 수정 반영"}
          </button>
        </form>

        <form
          className="admin-action-card admin-action-card--replacement"
          onSubmit={submitSourceReplacement}
        >
          <p className="admin-action-code">SOURCE_REPLACEMENT</p>
          <h3>출처 교체</h3>
          <p id="source-replacement-warning" className="admin-warning">
            기존 근거 자료는 이전 출처에 그대로 남아요. 이전 출처 기록을
            덮어쓰지 않아요.
          </p>
          <fieldset aria-describedby="source-replacement-warning">
            <legend>교체할 출처</legend>
            <label>
              <input
                name="replacementKind"
                type="radio"
                value="CREATE"
                checked={replacementKind === "CREATE"}
                onChange={() => setReplacementKind("CREATE")}
                required
              />
              새 출처 생성(CREATE)
            </label>
            <label>
              <input
                name="replacementKind"
                type="radio"
                value="REUSE"
                checked={replacementKind === "REUSE"}
                onChange={() => setReplacementKind("REUSE")}
                required
              />
              기존 출처 사용(REUSE)
            </label>
          </fieldset>
          {replacementKind === "CREATE" ? (
            <>
              <label htmlFor="replacement-source-name">
                새 출처 이름
                <input
                  id="replacement-source-name"
                  name="sourceName"
                  type="text"
                  maxLength={200}
                  required
                />
              </label>
              <label htmlFor="replacement-canonical-url">
                새 대표 URL
                <input
                  id="replacement-canonical-url"
                  name="canonicalUrl"
                  type="url"
                  required
                />
              </label>
            </>
          ) : (
            <label htmlFor="replacement-source-id">
              기존 출처 ID
              <input
                id="replacement-source-id"
                name="replacementSourceId"
                type="text"
                inputMode="text"
                required
                aria-describedby="source-replacement-warning"
              />
            </label>
          )}
          <label className="admin-confirmation" htmlFor="replacement-confirmed">
            <input
              id="replacement-confirmed"
              name="replacementConfirmed"
              type="checkbox"
              value="true"
              required
            />
            다른 출처를 새로 만들거나 기존 출처로 교체하는 작업임을 확인했어요.
          </label>
          <button type="submit" disabled={replacementPending}>
            {replacementPending ? "출처 교체 중…" : "출처 교체"}
          </button>
        </form>
      </div>
    </section>
  );
}
