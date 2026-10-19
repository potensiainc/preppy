"use client";

import { useEffect, useRef, type ComponentProps } from "react";

/** Browser history may restore edited controls from before a GET submission.
 * Restore the defaults belonging to the rendered URL, including BFCache restores.
 */
export function EnglishKindergartenFilterForm(props: ComponentProps<"form">) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const restore = () => form.current?.reset();
    restore();
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);
  return <form {...props} ref={form} />;
}
