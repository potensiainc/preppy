import { ShareButton } from "./share-button";

// Runtime (not build-time) lookup: release images are built once in CI and
// promoted across environments, so NEXT_PUBLIC_* inlining would not work.
function kakaoJavaScriptKey(): string | null {
  const value = process.env.KAKAO_JAVASCRIPT_KEY?.trim();
  return value && /^[0-9a-f]{32}$/iu.test(value) ? value : null;
}

export function ShareAction({
  path,
  title,
  variant,
}: Readonly<{ path: string; title: string; variant?: "default" | "compact" }>) {
  return (
    <ShareButton
      kakaoJsKey={kakaoJavaScriptKey()}
      path={path}
      title={title}
      variant={variant}
    />
  );
}
