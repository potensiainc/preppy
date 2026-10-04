import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
  const header = readFileSync(
    new URL("../../app/_components/site-header.tsx", import.meta.url),
    "utf8",
  );
  const commute = readFileSync(
    new URL("../../public/commute/index.html", import.meta.url),
    "utf8",
  );
  assertHeaderAuthAbsence("shared site header", header);
  assertHeaderAuthAbsence("commute header", commute);
  process.stdout.write("Public headers contain no Kakao login control.\n");
}
