"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { resolveRouteScrollAction } from "@/app/_components/route-scroll-policy";
import { legacyMenuDestination } from "@/app/_components/legacy-menu-url";

export function RouteScrollToTop() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(pathname);

  useLayoutEffect(() => {
    const redirectLegacyMenu = () => {
      const destination = legacyMenuDestination(
        window.location.pathname,
        window.location.hash,
      );
      if (destination)
        window.location.replace(destination + window.location.search);
    };
    redirectLegacyMenu();
    window.addEventListener("hashchange", redirectLegacyMenu);
    const action = resolveRouteScrollAction({
      previousPathname: previousPathname.current,
      nextPathname: pathname,
      hash: window.location.hash,
    });

    previousPathname.current = pathname;

    if (action === "TOP") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    return () => window.removeEventListener("hashchange", redirectLegacyMenu);
  }, [pathname]);

  return null;
}
