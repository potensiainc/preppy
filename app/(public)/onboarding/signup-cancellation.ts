export async function requestSignupCancellation(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher("/api/auth/onboarding/cancel", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !body ||
      typeof body !== "object" ||
      !("status" in body)
    )
      return false;
    return (
      (response.status === 202 && body.status === "PENDING") ||
      (response.status === 200 && body.status === "COMPLETED")
    );
  } catch {
    return false;
  }
}
