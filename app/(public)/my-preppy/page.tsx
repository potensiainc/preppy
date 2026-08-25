import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { MyPreppyView } from "@/app/(public)/my-preppy/my-preppy-view";
import { PageAnalytics } from "@/app/_components/page-analytics";
import { USER_SESSION_COOKIE_NAME } from "@/src/modules/auth/session.server";
import { getMyPreppyRuntime } from "@/src/modules/my-preppy/runtime.server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "내 프레피 | PREPPY",
  robots: { index: false, follow: false },
};

export default async function MyPreppyPage() {
  noStore();
  const cookieStore = await cookies();
  const result = await getMyPreppyRuntime().load(
    cookieStore.get(USER_SESSION_COOKIE_NAME)?.value ?? null,
  );

  if (result.access === "ANONYMOUS") redirect("/auth/kakao/start");
  if (result.access === "PENDING") redirect("/onboarding");
  if (result.access === "DENIED") notFound();

  return (
    <>
      <PageAnalytics
        events={[
          {
            name: "my_preppy_view",
            properties: {
              followCount: result.data.activeFollowCount,
              emailState: result.data.readiness.analyticsState,
            },
          },
        ]}
        navigationKey="MY_PREPPY"
      />
      <MyPreppyView data={result.data} />
    </>
  );
}
