"use client";

import { useCallback, useState } from "react";

const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
const KAKAO_SDK_INTEGRITY =
  "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";

type KakaoSdk = {
  init(key: string): void;
  isInitialized(): boolean;
  Share: { sendScrap(options: { requestUrl: string }): void };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let sdkPromise: Promise<KakaoSdk> | undefined;

function loadKakao(key: string): Promise<KakaoSdk> {
  sdkPromise ??= new Promise<KakaoSdk>((resolve, reject) => {
    const ready = () => {
      const kakao = window.Kakao;
      if (!kakao) return reject(new Error("Kakao SDK unavailable"));
      if (!kakao.isInitialized()) kakao.init(key);
      resolve(kakao);
    };
    if (window.Kakao) return ready();
    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      sdkPromise = undefined;
      reject(new Error("Kakao SDK failed to load"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function canonicalShareUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function ShareButton({
  kakaoJsKey,
  path,
  title,
  variant = "default",
}: Readonly<{
  kakaoJsKey: string | null;
  path: string;
  title: string;
  variant?: "default" | "compact";
}>) {
  const [notice, setNotice] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  }, []);

  const shareKakao = useCallback(async () => {
    const url = canonicalShareUrl(path);
    if (kakaoJsKey) {
      try {
        const kakao = await loadKakao(kakaoJsKey);
        kakao.Share.sendScrap({ requestUrl: url });
        return;
      } catch {
        // Fall through to the OS share sheet, which also lists KakaoTalk.
      }
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    flash((await copyLink(url)) ? "링크를 복사했어요" : url);
  }, [flash, kakaoJsKey, path, title]);

  const shareLink = useCallback(async () => {
    const url = canonicalShareUrl(path);
    flash((await copyLink(url)) ? "링크를 복사했어요" : url);
  }, [flash, path]);

  return (
    <div className={`share-actions share-actions--${variant}`}>
      <button
        type="button"
        className="share-actions__kakao"
        onClick={() => void shareKakao()}
      >
        카톡 공유
      </button>
      <button
        type="button"
        className="share-actions__link"
        onClick={() => void shareLink()}
      >
        링크 복사
      </button>
      <span className="share-actions__notice" role="status" aria-live="polite">
        {notice}
      </span>
    </div>
  );
}
