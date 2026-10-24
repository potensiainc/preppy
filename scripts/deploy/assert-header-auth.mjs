import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Owner decision 2026-10-24: the public header shows Kakao login for signed-out
// visitors and 내 프레피·logout for members. This guard keeps a stale branch
// from shipping a header without that control. Menu and footer stay free of
// raw login links so the header control remains the single entry point.
export const PUBLIC_HEADER_FILE = "app/_components/site-header.tsx";
export const LOGIN_FREE_FILES = [
  ["shared site menu", "app/_components/site-menu.tsx"],
  ["shared site footer", "app/_components/site-footer.tsx"],
];

export function assertHeaderAuthControl(source) {
  if (!/<AuthControl\s*\/>/u.test(source)) {
    throw new Error(
      "The public header lost its login control. The Owner decided on 2026-10-24 to show it.",
    );
  }
}

export function assertNoDuplicateLogin(name, source) {
  if (/auth\/kakao\/start/u.test(source)) {
    throw new Error(
      `${name} adds a second Kakao login link. Use the header login control.`,
    );
  }
}

export function assertPublicHeaderAuth(read) {
  assertHeaderAuthControl(read(PUBLIC_HEADER_FILE));
  for (const [name, file] of LOGIN_FREE_FILES) {
    assertNoDuplicateLogin(name, read(file));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertPublicHeaderAuth((file) =>
    readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
  );
  process.stdout.write("Public header shows the Kakao login control.\n");
}
