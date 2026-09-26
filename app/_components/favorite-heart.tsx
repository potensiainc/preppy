import type { Ref } from "react";

export function FavoriteHeart({
  saved,
  pending = false,
  label,
  onClick,
  buttonRef,
}: {
  saved: boolean;
  pending?: boolean;
  label: string;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      className="favorite-heart"
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={saved}
      aria-busy={pending}
      disabled={pending}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
        focusable="false"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>
    </button>
  );
}
