import { readFileSync } from "node:fs";

const header = readFileSync(new URL("../../app/_components/site-header.tsx", import.meta.url), "utf8");
const commute = readFileSync(new URL("../../public/commute/index.html", import.meta.url), "utf8");

for (const [name, source] of [["shared site header", header], ["commute header", commute]]) {
  if (/AuthControl|auth-control|auth\/kakao\/start|카카오로 로그인|카카오 로그인/u.test(source)) {
    throw new Error(`${name} exposes an authentication control. Owner approval is required before restoring header login.`);
  }
}

process.stdout.write("Public headers contain no Kakao login control.\n");
