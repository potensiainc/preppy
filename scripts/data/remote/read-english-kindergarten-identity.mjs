// 운영 웹 컨테이너 안에서 실행하는 읽기 전용 조회예요. 쓰기 문장은 없어요.
// 입력: { "slugs": [...] } 를 담은 JSON 파일 경로(argv[2]).
// 출력: 가져오기 패키지 빌드에 쓰는 식별 행 배열(stdout).
import { readFileSync } from "node:fs";
import postgres from "postgres";

const { slugs } = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(slugs) || slugs.length === 0) {
  throw new Error("slugs 입력이 없어요.");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await sql.begin("read only", (tx) => tx`
    select slug,
           display_name as "displayName",
           address_line as "addressLine",
           district,
           website_url as "websiteUrl",
           operational_state as "operationalState"
    from institutions
    where category = 'ENGLISH_KINDERGARTEN'
      and slug = any(${slugs})
    order by slug`);
  if (rows.length !== slugs.length) {
    throw new Error(`식별 행 ${rows.length}개, 기대 ${slugs.length}개`);
  }
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} finally {
  await sql.end();
}
