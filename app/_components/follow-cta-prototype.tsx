"use client";

import { useRef, useState } from "react";

const explanation =
  "카카오 로그인과 관심기관 알림 연결은 다음 단계에서 제공됩니다.";

export function FollowCtaPrototype() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    setIsOpen(true);
    dialog.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleClose() {
    setIsOpen(false);
    openerRef.current?.focus();
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    closeDialog();
  }

  return (
    <div className="follow-cta">
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        ref={openerRef}
        type="button"
        onClick={openDialog}
      >
        업데이트 받기
      </button>
      <dialog
        aria-labelledby="follow-dialog-title"
        className="follow-dialog"
        ref={dialogRef}
        onCancel={handleCancel}
        onClose={handleClose}
      >
        <div className="follow-dialog__content">
          <p className="eyebrow">PREPPY 알림</p>
          <h2 id="follow-dialog-title">관심기관 소식, 곧 알려드릴게요</h2>
          <p>{explanation}</p>
          <button type="button" onClick={closeDialog}>
            확인
          </button>
        </div>
      </dialog>
    </div>
  );
}
