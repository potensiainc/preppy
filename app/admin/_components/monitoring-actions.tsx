"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { isCanonicalAdminActionUrl } from "@/src/modules/admin/action-url";
import type { AdminMonitoringDetailDTO } from "@/src/modules/admin/read-model/monitoring-detail-query.server";

import {
  SourceMoveActions,
  type SubmitSourceAction,
} from "./source-move-actions";

type CandidateBodyBuilder = (form: FormData) => unknown;
type SubmitCandidate = (
  endpoint: string,
  body: CandidateBodyBuilder,
  form: HTMLFormElement,
) => Promise<void>;

function nullableString(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredString(form: FormData, name: string): string {
  const value = nullableString(form, name);
  if (value === null) throw new Error("필수 입력값을 채워 주세요.");
  return value;
}

function optionalNumber(form: FormData, name: string): number | undefined {
  const value = nullableString(form, name);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error("숫자 값을 다시 확인해 주세요.");
  return parsed;
}

export function buildSourceUnavailableBody(form: FormData) {
  const outcome = requiredString(form, "outcome");
  if (
    outcome !== "NOT_FOUND" &&
    outcome !== "ACCESS_ERROR" &&
    outcome !== "PARSE_ERROR" &&
    outcome !== "TIMEOUT"
  ) {
    throw new Error("출처를 확인하지 못한 유형을 다시 선택해 주세요.");
  }
  const finalUrl = nullableString(form, "finalUrl");
  if (
    finalUrl !== null &&
    (!isCanonicalAdminActionUrl(finalUrl) || new URL(finalUrl).hash !== "")
  ) {
    throw new Error("최종 출처 URL을 정확한 HTTP(S) 주소로 입력해 주세요.");
  }
  const httpStatus = optionalNumber(form, "httpStatus");
  const durationMs = optionalNumber(form, "durationMs");
  const errorCode = nullableString(form, "errorCode");
  const errorMessage = nullableString(form, "errorMessage");
  return {
    outcome,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(finalUrl === null ? {} : { finalUrl }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(errorCode === null ? {} : { errorCode }),
    ...(errorMessage === null ? {} : { errorMessage }),
    pauseSource: form.get("pauseSource") === "true",
  };
}

export function buildSourceBindingBody(form: FormData) {
  if (form.get("bindConfirmed") !== "true") {
    throw new Error("출처 연결 변경 내용을 확인하고 확인란을 선택해 주세요.");
  }
  return {
    sourceId: requiredString(form, "sourceId"),
    role: requiredString(form, "role"),
    isPrimary: form.get("isPrimary") === "true",
  };
}

export function parseExactActionUrlCandidate(
  value: FormDataEntryValue | null,
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isCanonicalAdminActionUrl(value)) {
    throw new Error("이동 URL은 정확한 HTTP(S) 주소로 입력해 주세요.");
  }
  return value;
}

function actionUrlFromForm(form: FormData): string | null {
  return parseExactActionUrlCandidate(form.get("actionUrl"));
}

const EXPLICIT_OFFSET_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export function parseExplicitOffsetDateTimeCandidate(
  value: FormDataEntryValue | null,
): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error(
      "날짜와 시간을 확인하고 시간대(Z 또는 +09:00 등)를 함께 입력해 주세요.",
    );
  }
  const match = EXPLICIT_OFFSET_DATE_TIME.exec(value);
  if (!match) {
    throw new Error(
      "날짜와 시간을 확인하고 시간대(Z 또는 +09:00 등)를 함께 입력해 주세요.",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > maxDay ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(
      "날짜와 시간을 확인하고 시간대(Z 또는 +09:00 등)를 함께 입력해 주세요.",
    );
  }
  return value;
}

function nullableDateTime(form: FormData, name: string): string | null {
  return parseExplicitOffsetDateTimeCandidate(form.get(name));
}

function dateTimeValue(value: string | null | undefined): string {
  return value ?? "";
}

function reloadDetailAfterAnnouncement(): void {
  window.setTimeout(() => window.location.reload(), 600);
}

function evidenceFromForm(form: FormData) {
  const observationId = nullableString(form, "observationId");
  return {
    evidenceRole: "PRIMARY",
    ...(observationId === null ? {} : { observationId }),
  };
}

type OpportunityDetail = Extract<
  AdminMonitoringDetailDTO,
  { kind: "OPPORTUNITY_NATIVE" | "OPPORTUNITY_LEGACY" }
>;

export function buildOpportunityCandidateBody(
  detail: OpportunityDetail,
  form: FormData,
) {
  const expectedCurrentVersionId = nullableString(
    form,
    "expectedCurrentVersionId",
  );
  const sourceId = requiredString(form, "sourceId");
  const materialityPair = nullableString(form, "materialityPair");
  if (
    materialityPair !== null &&
    materialityPair !== "USER_IMPACT" &&
    materialityPair !== "NON_USER_FACING"
  ) {
    throw new Error("중요도 재정의 값을 다시 확인해 주세요.");
  }
  if (expectedCurrentVersionId === null && materialityPair !== null) {
    throw new Error("최초 등록 시에는 중요도를 재정의할 수 없어요.");
  }
  const materiality =
    materialityPair === null
      ? {}
      : materialityPair === "USER_IMPACT"
        ? {
            materialityOverride: "NOTIFIABLE",
            overrideReason: "MATERIALITY_USER_IMPACT_CONFIRMED",
          }
        : {
            materialityOverride: "NON_NOTIFIABLE",
            overrideReason: "MATERIALITY_NON_USER_FACING_CONFIRMED",
          };
  const proposedState =
    detail.kind === "OPPORTUNITY_NATIVE"
      ? {
          businessState: requiredString(form, "businessState"),
          title: requiredString(form, "title"),
          summary: nullableString(form, "summary"),
          targetAudience: nullableString(form, "targetAudience"),
          eventStartAt: nullableDateTime(form, "eventStartAt"),
          eventEndAt: nullableDateTime(form, "eventEndAt"),
          applicationOpenAt: nullableDateTime(form, "applicationOpenAt"),
          applicationCloseAt: nullableDateTime(form, "applicationCloseAt"),
          actionUrl: actionUrlFromForm(form),
          locationText: nullableString(form, "locationText"),
          validFrom: nullableDateTime(form, "validFrom"),
          validUntil: nullableDateTime(form, "validUntil"),
        }
      : {
          knowledgeState: requiredString(form, "knowledgeState"),
          eventStatus: requiredString(form, "eventStatus"),
          displayTitle: requiredString(form, "displayTitle"),
          eventStartDate: nullableString(form, "eventStartDate"),
          eventStartTime: nullableString(form, "eventStartTime"),
          eventEndDate: nullableString(form, "eventEndDate"),
          eventEndTime: nullableString(form, "eventEndTime"),
          registrationOpenDate: nullableString(form, "registrationOpenDate"),
          registrationOpenTime: nullableString(form, "registrationOpenTime"),
          registrationCloseDate: nullableString(form, "registrationCloseDate"),
          registrationCloseTime: nullableString(form, "registrationCloseTime"),
          timezone: requiredString(form, "timezone"),
          venue: nullableString(form, "venue"),
          actionUrl: actionUrlFromForm(form),
          officialNotes: nullableString(form, "officialNotes"),
        };
  return {
    expectedCurrentVersionId,
    proposedState,
    sourceId,
    evidence: evidenceFromForm(form),
    ...materiality,
  };
}

function OpportunityCandidateForm({
  detail,
  submitCandidate,
}: {
  detail: Extract<
    AdminMonitoringDetailDTO,
    { kind: "OPPORTUNITY_NATIVE" | "OPPORTUNITY_LEGACY" }
  >;
  submitCandidate: SubmitCandidate;
}) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    try {
      await submitCandidate(
        `/api/admin/opportunities/${encodeURIComponent(detail.opportunity.id)}/verify`,
        (form) => buildOpportunityCandidateBody(detail, form),
        formElement,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="admin-action-card" onSubmit={submit}>
      <h3>변경 내용 등록</h3>
      <p id="change-found-description">
        공식 자료에서 확인한 변경 내용을 입력해 주세요. 기준 정보 반영 방식과
        최종 변경 유형, 중요도, 사용자 알림 여부는 서버가 결정해요.
      </p>
      <input
        type="hidden"
        name="expectedCurrentVersionId"
        value={detail.expectedCurrentVersionId ?? ""}
      />
      <input type="hidden" name="sourceId" value={detail.source.id} />
      {detail.latestObservation === null ? null : (
        <input
          type="hidden"
          name="observationId"
          value={detail.latestObservation.id}
        />
      )}
      {detail.kind === "OPPORTUNITY_NATIVE" ? (
        <>
          <label htmlFor="change-title">
            변경할 제목
            <input
              id="change-title"
              name="title"
              type="text"
              maxLength={500}
              required
              defaultValue={detail.currentTruth?.title ?? ""}
              aria-describedby="change-found-description"
            />
          </label>
          <label htmlFor="change-state">
            확인한 진행 상태
            <select
              id="change-state"
              name="businessState"
              required
              defaultValue={detail.currentTruth?.businessState ?? "UNKNOWN"}
            >
              {[
                "UPCOMING",
                "OPEN",
                "CLOSED",
                "COMPLETED",
                "CANCELLED",
                "UNKNOWN",
              ].map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="change-summary">
            변경할 요약
            <textarea
              id="change-summary"
              name="summary"
              maxLength={5000}
              rows={4}
              defaultValue={detail.currentTruth?.summary ?? ""}
            />
          </label>
          <label htmlFor="change-target-audience">
            지원 대상
            <input
              id="change-target-audience"
              name="targetAudience"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.targetAudience ?? ""}
            />
          </label>
          <label htmlFor="change-event-start">
            행사 시작(시간대 포함 ISO)
            <input
              id="change-event-start"
              name="eventStartAt"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.eventStartAt)}
            />
          </label>
          <label htmlFor="change-event-end">
            행사 종료(시간대 포함 ISO)
            <input
              id="change-event-end"
              name="eventEndAt"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.eventEndAt)}
            />
          </label>
          <label htmlFor="change-application-open">
            신청 시작(시간대 포함 ISO)
            <input
              id="change-application-open"
              name="applicationOpenAt"
              type="text"
              defaultValue={dateTimeValue(
                detail.currentTruth?.applicationOpenAt,
              )}
            />
          </label>
          <label htmlFor="change-application-close">
            신청 마감(시간대 포함 ISO)
            <input
              id="change-application-close"
              name="applicationCloseAt"
              type="text"
              defaultValue={dateTimeValue(
                detail.currentTruth?.applicationCloseAt,
              )}
            />
          </label>
          <label htmlFor="change-action-url">
            이동 URL
            <input
              id="change-action-url"
              name="actionUrl"
              type="url"
              maxLength={2048}
              defaultValue={detail.currentTruth?.actionUrl ?? ""}
            />
          </label>
          <label htmlFor="change-location">
            장소
            <input
              id="change-location"
              name="locationText"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.locationText ?? ""}
            />
          </label>
          <label htmlFor="change-valid-from">
            유효 시작(시간대 포함 ISO)
            <input
              id="change-valid-from"
              name="validFrom"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.validFrom)}
            />
          </label>
          <label htmlFor="change-valid-until">
            유효 종료(시간대 포함 ISO)
            <input
              id="change-valid-until"
              name="validUntil"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.validUntil)}
            />
          </label>
        </>
      ) : (
        <>
          <label htmlFor="legacy-display-title">
            변경할 표시 제목
            <input
              id="legacy-display-title"
              name="displayTitle"
              type="text"
              maxLength={500}
              required
              defaultValue={detail.currentTruth?.displayTitle ?? ""}
              aria-describedby="change-found-description"
            />
          </label>
          <label htmlFor="legacy-knowledge-state">
            정보 확인 상태
            <select
              id="legacy-knowledge-state"
              name="knowledgeState"
              required
              defaultValue={detail.currentTruth?.knowledgeState ?? "KNOWN"}
            >
              {[
                "KNOWN",
                "NOT_ANNOUNCED",
                "NOT_FOUND",
                "SOURCE_ERROR",
                "NOT_APPLICABLE",
              ].map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="legacy-event-status">
            행사 상태
            <select
              id="legacy-event-status"
              name="eventStatus"
              required
              defaultValue={detail.currentTruth?.eventStatus ?? "SCHEDULED"}
            >
              {["SCHEDULED", "ACTIVE", "CLOSED", "COMPLETED", "CANCELLED"].map(
                (state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ),
              )}
            </select>
          </label>
          <label htmlFor="legacy-event-start-date">
            행사 시작일
            <input
              id="legacy-event-start-date"
              name="eventStartDate"
              type="date"
              defaultValue={detail.currentTruth?.eventStartDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-start-time">
            행사 시작 시각
            <input
              id="legacy-event-start-time"
              name="eventStartTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.eventStartTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-end-date">
            행사 종료일
            <input
              id="legacy-event-end-date"
              name="eventEndDate"
              type="date"
              defaultValue={detail.currentTruth?.eventEndDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-end-time">
            행사 종료 시각
            <input
              id="legacy-event-end-time"
              name="eventEndTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.eventEndTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-open">
            접수 시작일
            <input
              id="legacy-registration-open"
              name="registrationOpenDate"
              type="date"
              defaultValue={detail.currentTruth?.registrationOpenDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-open-time">
            접수 시작 시각
            <input
              id="legacy-registration-open-time"
              name="registrationOpenTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.registrationOpenTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-close">
            접수 마감일
            <input
              id="legacy-registration-close"
              name="registrationCloseDate"
              type="date"
              defaultValue={detail.currentTruth?.registrationCloseDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-close-time">
            접수 마감 시각
            <input
              id="legacy-registration-close-time"
              name="registrationCloseTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.registrationCloseTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-timezone">
            시간대
            <input
              id="legacy-timezone"
              name="timezone"
              type="text"
              required
              defaultValue={detail.currentTruth?.timezone ?? "Asia/Seoul"}
            />
          </label>
          <label htmlFor="legacy-venue">
            장소
            <input
              id="legacy-venue"
              name="venue"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.venue ?? ""}
            />
          </label>
          <label htmlFor="legacy-action-url">
            이동 URL
            <input
              id="legacy-action-url"
              name="actionUrl"
              type="url"
              maxLength={2048}
              defaultValue={detail.currentTruth?.actionUrl ?? ""}
            />
          </label>
          <label htmlFor="legacy-official-notes">
            공식 유의사항
            <textarea
              id="legacy-official-notes"
              name="officialNotes"
              rows={3}
              maxLength={5000}
            />
          </label>
        </>
      )}
      {detail.expectedCurrentVersionId === null ? null : (
        <label htmlFor="materiality-pair">
          중요도 재정의(선택)
          <select id="materiality-pair" name="materialityPair" defaultValue="">
            <option value="">기본 정책 적용</option>
            <option value="USER_IMPACT">사용자 영향 확인</option>
            <option value="NON_USER_FACING">
              사용자에게 노출되지 않음 확인
            </option>
          </select>
        </label>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "검수 반영 중…" : "입학정보 검수 반영"}
      </button>
    </form>
  );
}

function FactCandidateForm({
  detail,
  submitCandidate,
}: {
  detail: Extract<AdminMonitoringDetailDTO, { kind: "INSTITUTION" }>;
  submitCandidate: SubmitCandidate;
}) {
  const [factType, setFactType] = useState(detail.facts[0]!.factType);
  const fact = detail.facts.find((item) => item.factType === factType)!;
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    try {
      await submitCandidate(
        `/api/admin/institutions/${encodeURIComponent(detail.institution.id)}/facts/${encodeURIComponent(factType)}/verify`,
        (form) => {
          const rawValue = requiredString(form, "valueJson");
          let valueJson: unknown;
          try {
            valueJson = JSON.parse(rawValue);
          } catch {
            throw new Error("입력한 JSON 형식을 다시 확인해 주세요.");
          }
          return {
            expectedCurrentVersionId: nullableString(
              form,
              "expectedCurrentVersionId",
            ),
            proposedState: {
              valueJson,
              displayText: nullableString(form, "displayText"),
              validFrom: nullableDateTime(form, "validFrom"),
              validUntil: nullableDateTime(form, "validUntil"),
            },
            sourceId: requiredString(form, "sourceId"),
            evidence: evidenceFromForm(form),
          };
        },
        formElement,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="admin-action-card" onSubmit={submit}>
      <h3>기본 정보 검수</h3>
      <p id="fact-candidate-description">
        기본 정보(Fact) 유형을 선택하고 표시 문구와 허용 범위의 JSON 값만 입력해
        주세요.
      </p>
      <label htmlFor="fact-type">
        기본 정보 유형
        <select
          id="fact-type"
          name="factTypeCandidate"
          value={factType}
          onChange={(event) =>
            setFactType(event.target.value as typeof factType)
          }
          aria-describedby="fact-candidate-description"
        >
          {detail.facts.map((item) => (
            <option key={item.factType} value={item.factType}>
              {item.factType.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <input
        type="hidden"
        name="expectedCurrentVersionId"
        value={fact.expectedCurrentVersionId ?? ""}
      />
      <input type="hidden" name="sourceId" value={detail.source.id} />
      {detail.latestObservation === null ? null : (
        <input
          type="hidden"
          name="observationId"
          value={detail.latestObservation.id}
        />
      )}
      <label htmlFor="fact-display-text">
        변경할 표시 문구
        <textarea
          key={`fact-display-${factType}`}
          id="fact-display-text"
          name="displayText"
          rows={3}
          maxLength={5000}
          defaultValue={fact.current?.displayText ?? ""}
        />
      </label>
      <label htmlFor="fact-value-json">
        변경할 JSON 값
        <textarea
          key={`fact-value-${factType}`}
          id="fact-value-json"
          name="valueJson"
          rows={5}
          required
          placeholder='{"currency":"KRW","amount":1200000}'
        />
      </label>
      <label htmlFor="fact-valid-from">
        유효 시작(시간대 포함 ISO)
        <input
          key={`fact-valid-from-${factType}`}
          id="fact-valid-from"
          name="validFrom"
          type="text"
          defaultValue={dateTimeValue(fact.current?.validFrom)}
        />
      </label>
      <label htmlFor="fact-valid-until">
        유효 종료(시간대 포함 ISO)
        <input
          key={`fact-valid-until-${factType}`}
          id="fact-valid-until"
          name="validUntil"
          type="text"
          defaultValue={dateTimeValue(fact.current?.validUntil)}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "검수 반영 중…" : "기본 정보 검수 반영"}
      </button>
    </form>
  );
}

export function MonitoringActions({
  detail,
}: {
  detail: AdminMonitoringDetailDTO;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState({ message: "", occurrence: 0 });
  const [noChangePending, setNoChangePending] = useState(false);
  const [sourcePending, setSourcePending] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error.message !== "") errorSummary.current?.focus();
  }, [error.message, error.occurrence]);

  function clearError(): void {
    setError((current) =>
      current.message === "" ? current : { ...current, message: "" },
    );
  }

  function reportError(cause: unknown, fallback: string): void {
    const message = cause instanceof Error ? cause.message : fallback;
    setError((current) => ({
      message,
      occurrence: current.occurrence + 1,
    }));
  }

  const submitAdminAction: SubmitSourceAction = async (
    endpoint: string,
    method,
    body,
  ) => {
    clearError();
    setStatus("요청 처리 중…");
    setSourcePending(true);
    try {
      const candidate = typeof body === "function" ? body() : body;
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const payload = (await response.json()) as {
        data?: {
          outcome?: string;
          state?: string;
          lifecycleStatus?: string;
          moveMode?: string;
        };
        error?: { message?: string };
      };
      if (!response.ok) {
        const message =
          response.status === 409
            ? "다른 운영자가 먼저 변경했을 수 있어요. 최신 데이터를 다시 불러와 확인한 뒤 수정해 주세요."
            : (payload.error?.message ??
              "요청을 완료하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.");
        if (response.status === 409) reloadDetailAfterAnnouncement();
        throw new Error(message);
      }
      const outcome =
        payload.data?.outcome ??
        payload.data?.state ??
        payload.data?.lifecycleStatus ??
        payload.data?.moveMode;
      const committedLabel = endpoint.endsWith("/verify")
        ? "검수 결과를 반영했어요."
        : "요청을 반영했어요.";
      setStatus(
        outcome ? `${committedLabel} 처리 결과: ${outcome}` : committedLabel,
      );
      reloadDetailAfterAnnouncement();
    } catch (cause) {
      setStatus("");
      reportError(
        cause,
        "요청을 완료하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setSourcePending(false);
    }
  };

  async function submitCandidate(
    endpoint: string,
    buildBody: CandidateBodyBuilder,
    formElement: HTMLFormElement,
  ) {
    return submitAdminAction(endpoint, "POST", () =>
      buildBody(new FormData(formElement)),
    );
  }

  async function submitSourceUnavailable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await submitAdminAction(
      `/api/admin/sources/${encodeURIComponent(detail.source.id)}/unavailable`,
      "POST",
      () => buildSourceUnavailableBody(new FormData(form)),
    );
  }

  const targetBindingBase =
    detail.kind === "INSTITUTION"
      ? `/api/admin/institutions/${encodeURIComponent(detail.institution.id)}/source-bindings`
      : `/api/admin/opportunities/${encodeURIComponent(detail.opportunity.id)}/source-bindings`;
  const bindingRoles =
    detail.kind === "INSTITUTION"
      ? [
          "OFFICIAL_MAIN",
          "ADMISSIONS",
          "TUITION",
          "CURRICULUM",
          "APPLICATION",
          "OTHER",
        ]
      : ["PRIMARY_NOTICE", "APPLICATION", "DETAILS", "SUPPORTING", "OTHER"];

  async function submitBind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await submitAdminAction(targetBindingBase, "POST", () =>
      buildSourceBindingBody(new FormData(form)),
    );
  }

  async function submitUnbind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await submitAdminAction(
      `${targetBindingBase}/${encodeURIComponent(detail.source.id)}/${encodeURIComponent(detail.binding.role)}`,
      "DELETE",
      () => {
        if (new FormData(form).get("unbindConfirmed") !== "true") {
          throw new Error(
            "해제할 출처 연결을 확인하고 확인란을 선택해 주세요.",
          );
        }
        return {};
      },
    );
  }

  async function submitNoChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    clearError();
    setStatus("출처 확인 기록 중…");
    setNoChangePending(true);
    const form = new FormData(formElement);
    const rawNote = form.get("note");
    const note = typeof rawNote === "string" ? rawNote.trim() : "";

    try {
      const response = await fetch(
        `/api/admin/monitoring/sources/${encodeURIComponent(detail.source.id)}/no-change`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(note === "" ? {} : { note }),
        },
      );
      const payload = (await response.json()) as {
        data?: { checkedAt?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          payload.error?.message ??
            "출처 확인 결과를 기록하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
        );
      }
      setStatus(
        payload.data?.checkedAt
          ? `출처 확인 결과를 기록했어요. 확인 시각: ${payload.data.checkedAt}`
          : "출처 확인 결과를 기록했어요.",
      );
      formElement.reset();
    } catch (cause) {
      setStatus("");
      reportError(
        cause,
        "출처 확인 결과를 기록하지 못했어요. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setNoChangePending(false);
    }
  }
  return (
    <div className="admin-monitoring-actions">
      <div
        className="admin-error-summary"
        role="alert"
        tabIndex={-1}
        aria-labelledby="monitoring-error-heading"
        hidden={error.message === ""}
        ref={errorSummary}
      >
        <h2 id="monitoring-error-heading">요청 내용 확인</h2>
        <p>{error.message}</p>
      </div>

      <section aria-labelledby="monitoring-decisions-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-decisions-heading">검수 작업</h2>
        </div>
        <div className="admin-action-grid">
          <form className="admin-action-card" onSubmit={submitNoChange}>
            <h3>변경 없음</h3>
            <p id="no-change-description">
              출처를 확인했다는 사실만 기록해요. 기준 정보는 바뀌지 않아요.
            </p>
            <label htmlFor="no-change-note">
              운영자 메모(선택)
              <textarea
                id="no-change-note"
                name="note"
                rows={3}
                maxLength={500}
                aria-describedby="no-change-description"
              />
            </label>
            <button type="submit" disabled={noChangePending}>
              {noChangePending ? "기록 중…" : "변경 없음 기록"}
            </button>
          </form>
          {detail.kind === "INSTITUTION" ? (
            <FactCandidateForm
              detail={detail}
              submitCandidate={submitCandidate}
            />
          ) : (
            <OpportunityCandidateForm
              detail={detail}
              submitCandidate={submitCandidate}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="source-lifecycle-heading">
        <div className="admin-section-heading">
          <h2 id="source-lifecycle-heading">출처 상태 관리</h2>
        </div>
        <div className="admin-action-grid">
          <form
            className="admin-action-card"
            onSubmit={submitSourceUnavailable}
          >
            <h3>출처 확인 실패</h3>
            <p id="source-unavailable-description">
              확인된 수집·접근 실패를 기록해요. 입학정보는 바뀌지 않아요.
            </p>
            <label htmlFor="source-unavailable-outcome">
              확인한 결과
              <select
                id="source-unavailable-outcome"
                name="outcome"
                defaultValue="NOT_FOUND"
                required
              >
                {["NOT_FOUND", "ACCESS_ERROR", "PARSE_ERROR", "TIMEOUT"].map(
                  (outcome) => (
                    <option key={outcome} value={outcome}>
                      {outcome}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label htmlFor="source-unavailable-http-status">
              HTTP 상태(선택)
              <input
                id="source-unavailable-http-status"
                name="httpStatus"
                type="number"
                min="100"
                max="599"
              />
            </label>
            <label htmlFor="source-unavailable-final-url">
              최종 URL(선택)
              <input
                id="source-unavailable-final-url"
                name="finalUrl"
                type="url"
                maxLength={2048}
                defaultValue={detail.source.canonicalUrl}
              />
            </label>
            <label htmlFor="source-unavailable-duration">
              소요 시간(밀리초, 선택)
              <input
                id="source-unavailable-duration"
                name="durationMs"
                type="number"
                min="0"
                max="86400000"
              />
            </label>
            <label htmlFor="source-unavailable-error-code">
              오류 코드(선택)
              <input
                id="source-unavailable-error-code"
                name="errorCode"
                type="text"
                maxLength={64}
                pattern="[A-Z][A-Z0-9_]{0,63}"
              />
            </label>
            <label htmlFor="source-unavailable-note">
              진단 메모(최대 500자, 선택)
              <textarea
                id="source-unavailable-note"
                name="errorMessage"
                rows={3}
                maxLength={500}
                aria-describedby="source-unavailable-description"
              />
            </label>
            <label className="admin-confirmation" htmlFor="pause-source">
              <input
                id="pause-source"
                name="pauseSource"
                type="checkbox"
                value="true"
              />
              확인 실패를 기록한 뒤 이 출처의 수집을 일시 중지해요.
            </label>
            <button type="submit" disabled={sourcePending}>
              출처 확인 실패 기록
            </button>
          </form>

          <div className="admin-action-card admin-binding-actions">
            <h3>출처 연결</h3>
            <form onSubmit={submitBind}>
              <h4>출처 연결</h4>
              <label htmlFor="bind-source-id">
                연결할 출처 ID
                <input
                  id="bind-source-id"
                  name="sourceId"
                  type="text"
                  required
                  aria-describedby="bind-source-description"
                />
              </label>
              <p id="bind-source-description">
                서버가 연결 역할의 허용 여부와 대표 출처 중복 여부를 확인해요.
              </p>
              <label htmlFor="bind-role">
                연결 역할
                <select id="bind-role" name="role" required>
                  {bindingRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-confirmation" htmlFor="bind-primary">
                <input
                  id="bind-primary"
                  name="isPrimary"
                  type="checkbox"
                  value="true"
                />
                선택한 역할의 대표 출처로 설정해요.
              </label>
              <label className="admin-confirmation" htmlFor="bind-confirmed">
                <input
                  id="bind-confirmed"
                  name="bindConfirmed"
                  type="checkbox"
                  value="true"
                  required
                />
                연결 대상, 출처, 역할, 대표 출처 여부를 확인했어요.
              </label>
              <button type="submit" disabled={sourcePending}>
                출처 연결
              </button>
            </form>
            <form onSubmit={submitUnbind}>
              <h4>출처 연결 해제</h4>
              <label className="admin-confirmation" htmlFor="unbind-confirmed">
                <input
                  id="unbind-confirmed"
                  name="unbindConfirmed"
                  type="checkbox"
                  value="true"
                  required
                />
                이 활성 출처 연결을 해제할 것인지 확인했어요.
              </label>
              <button type="submit" disabled={sourcePending}>
                출처 연결 해제
              </button>
            </form>
          </div>
        </div>
      </section>

      <SourceMoveActions
        sourceId={detail.source.id}
        sourceName={detail.source.sourceName}
        canonicalUrl={detail.source.canonicalUrl}
        submitAction={submitAdminAction}
      />
      <p className="admin-form-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
