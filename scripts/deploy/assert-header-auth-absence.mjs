import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Every file that renders the public header, its menu or the footer. The
// follow button's own login hand-off is a user-chosen flow and is not here.
export const PUBLIC_HEADER_FILES = [
  ["shared site header", "app/_components/site-header.tsx"],
  ["shared site menu", "app/_components/site-menu.tsx"],
  ["shared site footer", "app/_components/site-footer.tsx"],
  ["commute header", "public/commute/index.html"],
];

export function assertHeaderAuthAbsence(name, source) {
  if (
    /AuthControl|auth-control|auth\/kakao\/start|카카오로 로그인|카카오 로그인/u.test(
      source,
    )
  ) {
    throw new Error(
      `${name} exposes an authentication control. Owner approval is required before restoring header login.`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  for (const [name, file] of PUBLIC_HEADER_FILES) {
    assertHeaderAuthAbsence(
      name,
      readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
    );
  }
  process.stdout.write("Public headers contain no Kakao login control.\n");
}
