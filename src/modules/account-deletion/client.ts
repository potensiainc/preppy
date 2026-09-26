export type DeletionViewState = {
  kind: "idle" | "pending" | "completed" | "reauth" | "error" | "none";
};
type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
async function query(
  method: "GET" | "POST",
  fetcher: Fetcher,
): Promise<DeletionViewState> {
  try {
    const response = await fetcher("/api/me/account/deletion", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(method === "POST"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          }
        : {}),
    });
    if (
      method === "GET" &&
      (response.status === 401 || response.status === 404)
    )
      return { kind: "none" };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return { kind: "error" };
    if (
      response.status === 409 &&
      "code" in body &&
      body.code === "REAUTH_REQUIRED"
    )
      return { kind: "reauth" };
    if (!response.ok || !("status" in body)) return { kind: "error" };
    if (body.status === "PENDING") return { kind: "pending" };
    if (response.status === 200 && body.status === "COMPLETED")
      return { kind: "completed" };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
export function requestDeletion(fetcher: Fetcher = fetch) {
  return query("POST", fetcher);
}
export function readDeletionStatus(fetcher: Fetcher = fetch) {
  return query("GET", fetcher);
}
