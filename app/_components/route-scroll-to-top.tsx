"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { resolveRouteScrollAction } from "@/app/_components/route-scroll-policy";

export function RouteScrollToTop() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(pathname);

  useLayoutEffect(() => {
    const action = resolveRouteScrollAction({
      previousPathname: previousPathname.current,
      nextPathname: pathname,
      hash: window.location.hash,
    });

    previousPathname.current = pathname;

    if (action === "TOP") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);

  return null;
}
