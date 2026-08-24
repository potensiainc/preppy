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
  if (value === null) throw new Error("필수 후보 값을 입력해주세요.");
  return value;
}

function optionalNumber(form: FormData, name: string): number | undefined {
  const value = nullableString(form, name);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("숫자 값을 다시 확인해주세요.");
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
    throw new Error("Source unavailable 유형을 다시 확인해주세요.");
  }
  const finalUrl = nullableString(form, "finalUrl");
  if (
    finalUrl !== null &&
    (!isCanonicalAdminActionUrl(finalUrl) || new URL(finalUrl).hash !== "")
  ) {
    throw new Error("최종 Source URL을 정확한 HTTP(S) 주소로 입력해주세요.");
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
    throw new Error("canonical binding 변경을 명시적으로 확인해주세요.");
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
    throw new Error("Action URL은 정확한 HTTP(S) 주소여야 합니다.");
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
    throw new Error("날짜와 시간에는 명시적 시간대가 필요합니다.");
  }
  const match = EXPLICIT_OFFSET_DATE_TIME.exec(value);
  if (!match) {
    throw new Error("날짜와 시간에는 명시적 시간대가 필요합니다.");
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
    throw new Error("날짜와 시간에는 명시적 시간대가 필요합니다.");
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
    throw new Error("중요도 재정의 값을 다시 확인해주세요.");
  }
  if (expectedCurrentVersionId === null && materialityPair !== null) {
    throw new Error("최초 후보에는 중요도 재정의를 사용할 수 없습니다.");
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
      <h3>Change found</h3>
      <p id="change-found-description">
        Enter observed candidate facts. The server determines truth handling,
        final change type, materiality, and customer signaling.
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
            Candidate title
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
            Observed business state
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
            Candidate summary
            <textarea
              id="change-summary"
              name="summary"
              maxLength={5000}
              rows={4}
              defaultValue={detail.currentTruth?.summary ?? ""}
            />
          </label>
          <label htmlFor="change-target-audience">
            Target audience
            <input
              id="change-target-audience"
              name="targetAudience"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.targetAudience ?? ""}
            />
          </label>
          <label htmlFor="change-event-start">
            Event starts (ISO with offset)
            <input
              id="change-event-start"
              name="eventStartAt"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.eventStartAt)}
            />
          </label>
          <label htmlFor="change-event-end">
            Event ends (ISO with offset)
            <input
              id="change-event-end"
              name="eventEndAt"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.eventEndAt)}
            />
          </label>
          <label htmlFor="change-application-open">
            Application opens (ISO with offset)
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
            Application closes (ISO with offset)
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
            Action URL
            <input
              id="change-action-url"
              name="actionUrl"
              type="url"
              maxLength={2048}
              defaultValue={detail.currentTruth?.actionUrl ?? ""}
            />
          </label>
          <label htmlFor="change-location">
            Location
            <input
              id="change-location"
              name="locationText"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.locationText ?? ""}
            />
          </label>
          <label htmlFor="change-valid-from">
            Valid from (ISO with offset)
            <input
              id="change-valid-from"
              name="validFrom"
              type="text"
              defaultValue={dateTimeValue(detail.currentTruth?.validFrom)}
            />
          </label>
          <label htmlFor="change-valid-until">
            Valid until (ISO with offset)
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
            Candidate display title
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
            Knowledge state
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
            Event status
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
            Event starts (date)
            <input
              id="legacy-event-start-date"
              name="eventStartDate"
              type="date"
              defaultValue={detail.currentTruth?.eventStartDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-start-time">
            Event starts (time)
            <input
              id="legacy-event-start-time"
              name="eventStartTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.eventStartTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-end-date">
            Event ends (date)
            <input
              id="legacy-event-end-date"
              name="eventEndDate"
              type="date"
              defaultValue={detail.currentTruth?.eventEndDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-event-end-time">
            Event ends (time)
            <input
              id="legacy-event-end-time"
              name="eventEndTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.eventEndTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-open">
            Registration opens
            <input
              id="legacy-registration-open"
              name="registrationOpenDate"
              type="date"
              defaultValue={detail.currentTruth?.registrationOpenDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-open-time">
            Registration opens (time)
            <input
              id="legacy-registration-open-time"
              name="registrationOpenTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.registrationOpenTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-close">
            Registration closes
            <input
              id="legacy-registration-close"
              name="registrationCloseDate"
              type="date"
              defaultValue={detail.currentTruth?.registrationCloseDate ?? ""}
            />
          </label>
          <label htmlFor="legacy-registration-close-time">
            Registration closes (time)
            <input
              id="legacy-registration-close-time"
              name="registrationCloseTime"
              type="time"
              step="1"
              defaultValue={detail.currentTruth?.registrationCloseTime ?? ""}
            />
          </label>
          <label htmlFor="legacy-timezone">
            Timezone
            <input
              id="legacy-timezone"
              name="timezone"
              type="text"
              required
              defaultValue={detail.currentTruth?.timezone ?? "Asia/Seoul"}
            />
          </label>
          <label htmlFor="legacy-venue">
            Venue
            <input
              id="legacy-venue"
              name="venue"
              type="text"
              maxLength={1000}
              defaultValue={detail.currentTruth?.venue ?? ""}
            />
          </label>
          <label htmlFor="legacy-action-url">
            Action URL
            <input
              id="legacy-action-url"
              name="actionUrl"
              type="url"
              maxLength={2048}
              defaultValue={detail.currentTruth?.actionUrl ?? ""}
            />
          </label>
          <label htmlFor="legacy-official-notes">
            Official notes
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
          Materiality override (optional)
          <select id="materiality-pair" name="materialityPair" defaultValue="">
            <option value="">Use canonical policy</option>
            <option value="USER_IMPACT">User impact confirmed</option>
            <option value="NON_USER_FACING">Non-user-facing confirmed</option>
          </select>
        </label>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify Opportunity"}
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
            throw new Error("후보 값 JSON을 다시 확인해주세요.");
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
      <h3>Fact verify</h3>
      <p id="fact-candidate-description">
        Select a canonical Fact type and provide only the candidate display and
        bounded JSON value.
      </p>
      <label htmlFor="fact-type">
        Fact type
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
        Candidate display text
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
        Candidate value JSON
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
        Valid from (ISO with offset)
        <input
          key={`fact-valid-from-${factType}`}
          id="fact-valid-from"
          name="validFrom"
          type="text"
          defaultValue={dateTimeValue(fact.current?.validFrom)}
        />
      </label>
      <label htmlFor="fact-valid-until">
        Valid until (ISO with offset)
        <input
          key={`fact-valid-until-${factType}`}
          id="fact-valid-until"
          name="validUntil"
          type="text"
          defaultValue={dateTimeValue(fact.current?.validUntil)}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify Fact"}
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
    setStatus("Submitting Admin command…");
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
            ? "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요."
            : (payload.error?.message ??
              "Admin command could not be completed.");
        if (response.status === 409) reloadDetailAfterAnnouncement();
        throw new Error(message);
      }
      const outcome =
        payload.data?.outcome ??
        payload.data?.state ??
        payload.data?.lifecycleStatus ??
        payload.data?.moveMode;
      const committedLabel = endpoint.endsWith("/verify")
        ? "Verification committed:"
        : "Admin command committed:";
      setStatus(
        outcome ? `${committedLabel} ${outcome}.` : `${committedLabel} OK.`,
      );
      reloadDetailAfterAnnouncement();
    } catch (cause) {
      setStatus("");
      reportError(cause, "Admin command could not be completed.");
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
          throw new Error("정확한 canonical binding 해제를 확인해주세요.");
        }
        return {};
      },
    );
  }

  async function submitNoChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    clearError();
    setStatus("Submitting Source check…");
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
          payload.error?.message ?? "Source check could not be recorded.",
        );
      }
      setStatus(
        payload.data?.checkedAt
          ? `Source check recorded at ${payload.data.checkedAt}.`
          : "Source check recorded.",
      );
      formElement.reset();
    } catch (cause) {
      setStatus("");
      reportError(cause, "Source check could not be recorded.");
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
        <h2 id="monitoring-error-heading">Action needs attention</h2>
        <p>{error.message}</p>
      </div>

      <section aria-labelledby="monitoring-decisions-heading">
        <div className="admin-section-heading">
          <h2 id="monitoring-decisions-heading">Decision</h2>
        </div>
        <div className="admin-action-grid">
          <form className="admin-action-card" onSubmit={submitNoChange}>
            <h3>No change</h3>
            <p id="no-change-description">
              Confirm the Source was checked without changing canonical truth.
            </p>
            <label htmlFor="no-change-note">
              Optional operator note
              <textarea
                id="no-change-note"
                name="note"
                rows={3}
                maxLength={500}
                aria-describedby="no-change-description"
              />
            </label>
            <button type="submit" disabled={noChangePending}>
              {noChangePending ? "Recording…" : "Confirm no change"}
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
          <h2 id="source-lifecycle-heading">Source lifecycle</h2>
        </div>
        <div className="admin-action-grid">
          <form
            className="admin-action-card"
            onSubmit={submitSourceUnavailable}
          >
            <h3>Source unavailable</h3>
            <p id="source-unavailable-description">
              Report a confirmed operational failure without changing admission
              truth.
            </p>
            <label htmlFor="source-unavailable-outcome">
              Confirmed outcome
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
              HTTP status (optional)
              <input
                id="source-unavailable-http-status"
                name="httpStatus"
                type="number"
                min="100"
                max="599"
              />
            </label>
            <label htmlFor="source-unavailable-final-url">
              Final URL (optional)
              <input
                id="source-unavailable-final-url"
                name="finalUrl"
                type="url"
                maxLength={2048}
                defaultValue={detail.source.canonicalUrl}
              />
            </label>
            <label htmlFor="source-unavailable-duration">
              Duration in milliseconds (optional)
              <input
                id="source-unavailable-duration"
                name="durationMs"
                type="number"
                min="0"
                max="86400000"
              />
            </label>
            <label htmlFor="source-unavailable-error-code">
              Canonical error code (optional)
              <input
                id="source-unavailable-error-code"
                name="errorCode"
                type="text"
                maxLength={64}
                pattern="[A-Z][A-Z0-9_]{0,63}"
              />
            </label>
            <label htmlFor="source-unavailable-note">
              Bounded diagnostic (optional)
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
              Pause this Source after recording the unavailable observation.
            </label>
            <button type="submit" disabled={sourcePending}>
              Mark Source unavailable
            </button>
          </form>

          <div className="admin-action-card admin-binding-actions">
            <h3>Canonical binding</h3>
            <form onSubmit={submitBind}>
              <h4>Bind source</h4>
              <label htmlFor="bind-source-id">
                Candidate Source ID
                <input
                  id="bind-source-id"
                  name="sourceId"
                  type="text"
                  required
                  aria-describedby="bind-source-description"
                />
              </label>
              <p id="bind-source-description">
                The server validates role eligibility and primary conflicts.
              </p>
              <label htmlFor="bind-role">
                Binding role
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
                Make this the primary Source for the selected role.
              </label>
              <label className="admin-confirmation" htmlFor="bind-confirmed">
                <input
                  id="bind-confirmed"
                  name="bindConfirmed"
                  type="checkbox"
                  value="true"
                  required
                />
                I confirmed this target, Source, role, and primary state.
              </label>
              <button type="submit" disabled={sourcePending}>
                Bind source
              </button>
            </form>
            <form onSubmit={submitUnbind}>
              <h4>Unbind source</h4>
              <label className="admin-confirmation" htmlFor="unbind-confirmed">
                <input
                  id="unbind-confirmed"
                  name="unbindConfirmed"
                  type="checkbox"
                  value="true"
                  required
                />
                I confirmed this exact active canonical binding should be
                removed.
              </label>
              <button type="submit" disabled={sourcePending}>
                Unbind source
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
