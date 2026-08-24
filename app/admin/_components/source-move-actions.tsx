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
    throw new Error("필수 Source 값을 입력해주세요.");
  }
  return value.trim();
}

function canonicalSourceUrl(form: FormData, name: string): string {
  const value = requiredTrimmed(form, name);
  if (!isCanonicalAdminActionUrl(value) || new URL(value).hash !== "") {
    throw new Error(
      "Source URL은 fragment 없는 정확한 HTTP(S) 주소여야 합니다.",
    );
  }
  return value;
}

export function buildUrlCorrectionBody(form: FormData) {
  if (form.get("provenanceContinuityConfirmed") !== "true") {
    throw new Error("동일 provenance 연속성을 명시적으로 확인해주세요.");
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
    throw new Error("새 Source identity 전환을 명시적으로 확인해주세요.");
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
        <h2 id="source-move-heading">Source location</h2>
      </div>
      <p className="admin-callout">
        Choose a mode explicitly. PREPPY never infers whether Source provenance
        continues.
      </p>
      <div className="admin-source-move__modes">
        <form
          className="admin-action-card admin-action-card--correction"
          onSubmit={submitUrlCorrection}
        >
          <p className="admin-action-code">URL_CORRECTION</p>
          <h3>URL correction</h3>
          <p id="url-correction-description">
            Keep <strong>{sourceName}</strong> as the same Source identity and
            correct only its canonical URL.
          </p>
          <label htmlFor="source-correction-url">
            New official URL
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
            I confirmed this is the same official provenance and Source
            identity.
          </label>
          <button type="submit" disabled={correctionPending}>
            {correctionPending ? "Correcting…" : "Apply URL correction"}
          </button>
        </form>

        <form
          className="admin-action-card admin-action-card--replacement"
          onSubmit={submitSourceReplacement}
        >
          <p className="admin-action-code">SOURCE_REPLACEMENT</p>
          <h3>Source replacement</h3>
          <p id="source-replacement-warning" className="admin-warning">
            Historical Evidence remains attached to the old Source. The old
            identity is not rewritten.
          </p>
          <fieldset aria-describedby="source-replacement-warning">
            <legend>Replacement identity</legend>
            <label>
              <input
                name="replacementKind"
                type="radio"
                value="CREATE"
                checked={replacementKind === "CREATE"}
                onChange={() => setReplacementKind("CREATE")}
                required
              />
              CREATE a new Source identity
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
              REUSE an existing Source identity
            </label>
          </fieldset>
          {replacementKind === "CREATE" ? (
            <>
              <label htmlFor="replacement-source-name">
                New Source name
                <input
                  id="replacement-source-name"
                  name="sourceName"
                  type="text"
                  maxLength={200}
                  required
                />
              </label>
              <label htmlFor="replacement-canonical-url">
                New canonical URL
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
              Existing Source ID
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
            I understand this creates or reuses a different Source identity.
          </label>
          <button type="submit" disabled={replacementPending}>
            {replacementPending ? "Replacing…" : "Replace Source identity"}
          </button>
        </form>
      </div>
    </section>
  );
}
