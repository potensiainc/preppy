"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readDeletionStatus,
  requestDeletion,
  type DeletionViewState,
} from "@/src/modules/account-deletion/client";
import styles from "./settings.module.css";

export function DeletionControl({
  enabled,
  authenticated,
}: {
  enabled: boolean;
  authenticated: boolean;
}) {
  const [state, setState] = useState<DeletionViewState>({ kind: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(enabled && !authenticated);
  useEffect(() => {
    let active = true;
    if (enabled && !authenticated)
      void readDeletionStatus().then((result) => {
        if (active) {
          setState(result);
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [enabled, authenticated]);
  async function submit() {
    if (!confirmed || busy) return;
    setBusy(true);
    setState(await requestDeletion());
    setBusy(false);
  }
  async function refresh() {
    setBusy(true);
    setState(await readDeletionStatus());
    setBusy(false);
  }
  if (!enabled)
    return (
      <div className={styles.notice}>
        <p>
          화면에서 직접 탈퇴하는 기능은 아직 제공하지 않아요. 회원 탈퇴나
          개인정보 삭제를 원하면 아래 문의처로 요청해 주세요.
        </p>
        <a href="mailto:potensiainc@gmail.com?subject=PREPPY%20회원%20탈퇴%20요청">
          이메일로 탈퇴 요청
        </a>
        <p>
          비밀번호나 신분증 사본은 보내지 마세요. 요청 처리에 필요한 확인 사항은
          답변으로 안내해요.
        </p>
      </div>
    );
  if (checking) return <p role="status">탈퇴 처리 상태를 확인하고 있어요.</p>;
  if (state.kind === "pending" || state.kind === "completed")
    return (
      <div aria-live="polite">
        <h3>{state.kind === "pending" ? "계정 정보 삭제 처리 중" : "계정 정보 삭제 완료"}</h3>
        <p>
          {state.kind === "pending"
            ? "계정 정보 삭제 요청을 접수했어요. 계정 이용과 새 알림 발송을 중단했어요. 정보 삭제와 카카오 연결 해제를 처리하고 있어요."
            : "프레피 계정 정보 삭제와 카카오 연결 해제를 마쳤어요."}
        </p>
        <p>
          법령에 따라 보관하는 기록이 있으면 개인정보 처리방침에 안내한 기간
          동안 별도로 보관해요.
        </p>
        {state.kind === "pending" && (
          <button type="button" onClick={refresh} disabled={busy}>
            처리 상태 확인
          </button>
        )}
        <Link href="/">홈으로 이동</Link>
      </div>
    );
  return (
    <div>
      {state.kind === "error" && (
        <p role="alert">
          요청 결과를 확인하지 못했어요. 처리 상태를 다시 확인하거나 문의처로
          연락해 주세요.
        </p>
      )}
      {state.kind === "reauth" && (
        <p role="alert">
          계정 소유를 확인하려면 다시 로그인해 주세요. 돌아오면 탈퇴 여부를 다시
          확인해요.
        </p>
      )}
      {state.kind === "error" && (
        <button type="button" onClick={refresh} disabled={busy}>
          처리 상태 다시 확인
        </button>
      )}
      {!authenticated || state.kind === "reauth" ? (
        <a href="/auth/kakao/start?returnTo=%2Fmy-preppy%2Fsettings">
          카카오로 다시 로그인
        </a>
      ) : (
        <>
          <p>
            탈퇴하면 관심기관과 알림 설정이 삭제되고, 새 알림을 보내지 않아요.
            삭제된 정보는 다시 가입해도 복구할 수 없어요.
          </p>
          <p>
            프레피와 카카오의 연결도 해제해요. 카카오계정 자체는 삭제되지
            않아요. 이미 발송된 이메일은 회수할 수 없어요.
          </p>
          <p>
            법령에 따라 보관해야 하는 기록은 필요한 정보만 별도로 보관해요.{" "}
            <Link href="/privacy">개인정보 처리방침</Link>에서 확인해 주세요.
          </p>
          <label className={styles.confirm}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
            />
            탈퇴 후 삭제된 정보는 복구할 수 없음을 확인했어요.
          </label>
          <div className={styles.actions}>
            <Link href="/my-preppy">계정 유지</Link>
            <button
              className={styles.destructive}
              type="button"
              disabled={!confirmed || busy}
              onClick={submit}
            >
              {busy ? "탈퇴 요청 처리 중…" : "탈퇴하기"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
