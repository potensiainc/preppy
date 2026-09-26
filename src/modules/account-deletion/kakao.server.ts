import "server-only";
export async function unlinkKakao(
  subject: string,
  adminKey: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!/^[1-9][0-9]*$/.test(subject) || !adminKey)
    throw new Error("KAKAO_UNLINK_CONFIGURATION");
  const response = await fetcher("https://kapi.kakao.com/v1/user/unlink", {
    method: "POST",
    headers: {
      authorization: `KakaoAK ${adminKey}`,
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({
      target_id_type: "user_id",
      target_id: subject,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const payload = (await response.json()) as {
    id?: number | string;
    code?: number;
  };
  if (response.status === 400 && payload.code === -101) return;
  if (!response.ok || String(payload.id) !== subject)
    throw new Error("KAKAO_UNLINK_FAILED");
}
