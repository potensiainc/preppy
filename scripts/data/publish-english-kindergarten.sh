#!/usr/bin/env bash
# 영어유치원 공개 데이터를 운영 DB에 반영하는 단일 진입점이에요.
#
#   prepare --review <reviewed.json>
#     운영 식별 정보를 읽고(읽기 전용) → DB 백업 → 패키지 생성 → 로컬 검증
#     → 운영 dry-run → 체크섬을 출력해요. 운영 DB에는 쓰지 않아요.
#
#   apply --package-id <id> --checksum <sha256>
#     prepare가 기록한 체크섬과 정확히 같을 때만 적용하고, 적용 후 다시 dry-run으로 확인해요.
#     체크섬을 직접 입력하는 것이 승인 절차예요.
#
# 필요한 환경변수: RAILWAY_TOKEN_PRODUCTION
# 선택: PUBLISH_STATE_DIR(기본 ~/.preppy-publish), PUBLISH_BACKUP_DIR(기본 ~/preppy-backups)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_SCRIPT_DIR="$REPO_ROOT/scripts/data/remote"
STATE_DIR="${PUBLISH_STATE_DIR:-$HOME/.preppy-publish}"
BACKUP_DIR="${PUBLISH_BACKUP_DIR:-$HOME/preppy-backups}"
WEB_SERVICE="preppy-web"
DB_SERVICE="Postgres"
# 명령줄 인자 한도(약 128KB) 안에 base64로 담을 수 있는 압축 패키지 크기 상한
MAX_TRANSFER_BYTES=90000

die() {
  printf '중단: %s\n' "$1" >&2
  exit 1
}

railway_run() {
  [[ -n "${RAILWAY_TOKEN_PRODUCTION:-}" ]] || die "RAILWAY_TOKEN_PRODUCTION 환경변수가 필요해요."
  RAILWAY_TOKEN="$RAILWAY_TOKEN_PRODUCTION" npx -y @railway/cli@5.71.0 "$@"
}

b64() {
  base64 | tr -d '\n'
}

# 운영 웹 컨테이너에서 Node 스크립트를 실행하고 stdout을 돌려줘요. 쓰기 SQL은 없어요.
remote_node() { # <script.mjs> <input JSON>
  local script_b64 input_b64
  script_b64="$(b64 <"$1")"
  input_b64="$(printf '%s' "$2" | b64)"
  railway_run ssh --service "$WEB_SERVICE" -- sh -c \
    "echo '$script_b64' | base64 -d > /tmp/preppy-publish.mjs && echo '$input_b64' | base64 -d > /tmp/preppy-publish-input.json && cd /app && node /tmp/preppy-publish.mjs /tmp/preppy-publish-input.json"
}

# 운영 컨테이너에서 가져오기 CLI를 실행해요. $1은 환경변수 접두어, $2는 CLI 인자예요.
remote_import() { # <ENV=VALUE prefix or ""> <cli args>
  railway_run ssh --service "$WEB_SERVICE" -- sh -c "cd /app && $1 npm run -s data:import-english-kindergarten-mvp -- $2"
}

# 압축한 패키지를 운영 컨테이너의 임시 디렉터리에 옮겨요.
push_package() { # <local dir> <remote dir>
  local tgz="$STATE_DIR/package.tar.gz" payload
  tar -C "$1" -czf "$tgz" .
  [[ "$(wc -c <"$tgz")" -le "$MAX_TRANSFER_BYTES" ]] || die "패키지가 너무 커서 한 번에 옮길 수 없어요. 스트리밍 전송이 필요해요."
  payload="$(b64 <"$tgz")"
  railway_run ssh --service "$WEB_SERVICE" -- sh -c \
    "rm -rf '$2' && mkdir -p '$2' && echo '$payload' | base64 -d | tar -xz -C '$2'"
}

# 가져오기 결과를 검사해요. 검증 실패, 거부, 알림·발송 부수효과가 있으면 중단해요.
check_result() { # <result.json> <dry|apply>
  node -e '
    const fs = require("fs");
    const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const mode = process.argv[2];
    const fail = (message) => { console.error("중단: " + message); process.exit(1); };
    if (r.validation.status !== "PASS") fail("패키지 검증 실패: " + r.validation.errors.join("; "));
    if (r.rejects.length > 0) fail("거부 " + r.rejects.length + "건이 있어요. 아무것도 적용하지 않았어요.");
    const s = r.sideEffects;
    if (s.notifications > 0 || s.deliveries > 0) fail("알림·발송 부수효과가 발생했어요.");
    if (mode === "dry" && r.applied !== false) fail("dry-run이 적용 상태로 응답했어요.");
    if (mode === "apply" && r.applied !== true) fail("적용되지 않았어요.");
    console.log(JSON.stringify({
      packageChecksum: r.packageChecksum,
      planned: r.planned,
      appliedCounts: r.appliedCounts,
      sideEffects: s,
    }, null, 2));
  ' "$1" "$2"
}

state_get() { # <state file> <key>
  [[ -f "$1" ]] || return 0
  node -e 'const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = o[process.argv[2]]; if (v !== undefined && v !== null) console.log(v);' "$1" "$2"
}

state_set() { # <state file> <JSON object>
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    fs.writeFileSync(file, JSON.stringify({ ...current, ...JSON.parse(process.argv[2]) }, null, 2) + "\n");
  ' "$1" "$2"
}

cmd_prepare() {
  local review=""
  while (($#)); do
    case "$1" in
      --review) review="${2:-}"; shift 2 ;;
      *) die "알 수 없는 옵션: $1" ;;
    esac
  done
  [[ -f "$review" ]] || die "--review 파일이 없어요: $review"
  [[ -n "${RAILWAY_TOKEN_PRODUCTION:-}" ]] || die "RAILWAY_TOKEN_PRODUCTION 환경변수가 필요해요."

  local package_id slugs
  package_id="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).packageId)' "$review")"
  slugs="$(node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).campuses.map((c) => c.slug)))' "$review")"

  local work="$STATE_DIR/$package_id"
  local state="$STATE_DIR/$package_id.state.json"
  mkdir -p "$work" "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  echo "1/6 운영 식별 정보 읽기 (읽기 전용)"
  remote_node "$REMOTE_SCRIPT_DIR/read-english-kindergarten-identity.mjs" "{\"slugs\":$slugs}" >"$work/identity.json"
  node -e 'if (!Array.isArray(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))) process.exit(1)' "$work/identity.json" \
    || die "식별 정보 응답 형식이 올바르지 않아요."

  echo "2/6 운영 DB 백업"
  local backup="$BACKUP_DIR/preppy-$package_id-$(date -u +%Y%m%dT%H%M%SZ).dump"
  railway_run ssh --service "$DB_SERVICE" -- sh -c 'pg_dump -Fc -d "$POSTGRES_DB" -U "$POSTGRES_USER"' >"$backup.part"
  [[ -s "$backup.part" ]] || die "백업 파일이 비어 있어요. 반영을 중단했어요."
  if command -v pg_restore >/dev/null 2>&1; then
    pg_restore -l "$backup.part" >/dev/null || die "백업 파일을 읽을 수 없어요. 반영을 중단했어요."
  fi
  mv "$backup.part" "$backup"

  echo "3/6 패키지 생성과 로컬 검증"
  local pkg="$work/package"
  rm -rf "$pkg"
  (cd "$REPO_ROOT" && npx tsx --tsconfig scripts/db/tsconfig.json scripts/data/build-english-kindergarten-published-update.ts \
    --review "$review" --identity "$work/identity.json" --out "$pkg")
  (cd "$REPO_ROOT" && npm run -s data:import-english-kindergarten-mvp -- --package "$pkg" --validate-only) >"$work/validate.json"
  local local_checksum
  local_checksum="$(state_get "$work/validate.json" packageChecksum)"
  [[ -n "$local_checksum" ]] || die "로컬 검증에서 체크섬을 얻지 못했어요."

  echo "4/6 패키지 전송"
  local remote_pkg="/tmp/preppy-publish/$package_id"
  push_package "$pkg" "$remote_pkg"

  echo "5/6 운영 dry-run (DB에 쓰지 않음, 잠금만 사용)"
  remote_import "" "--package '$remote_pkg' --dry-run" >"$work/dry-run.json" || true
  local dry_summary
  dry_summary="$(check_result "$work/dry-run.json" dry)" || die "dry-run 검사에서 멈췄어요. $work/dry-run.json을 확인해 주세요."

  local remote_checksum
  remote_checksum="$(state_get "$work/dry-run.json" packageChecksum)"
  [[ "$remote_checksum" == "$local_checksum" ]] || die "로컬과 운영의 패키지 체크섬이 달라요. 반영하지 않았어요."

  echo "6/6 기록"
  state_set "$state" "{\"packageId\":\"$package_id\",\"packageChecksum\":\"$remote_checksum\",\"backupFile\":\"$backup\",\"remotePackage\":\"$remote_pkg\",\"preparedAt\":\"$(date -u +%FT%TZ)\"}"

  echo
  echo "$dry_summary"
  echo
  echo "dry-run 완료. 아래 체크섬을 확인하고 승인하면 반영해요."
  echo "백업: $backup"
  echo "승인 명령: bash scripts/data/publish-english-kindergarten.sh apply --package-id $package_id --checksum $remote_checksum"
}

cmd_apply() {
  local package_id="" checksum=""
  while (($#)); do
    case "$1" in
      --package-id) package_id="${2:-}"; shift 2 ;;
      --checksum) checksum="${2:-}"; shift 2 ;;
      *) die "알 수 없는 옵션: $1" ;;
    esac
  done
  [[ "$checksum" =~ ^[a-f0-9]{64}$ ]] || die "--checksum은 64자리 sha256이어야 해요."
  [[ -n "$package_id" ]] || die "--package-id가 필요해요."
  [[ -n "${RAILWAY_TOKEN_PRODUCTION:-}" ]] || die "RAILWAY_TOKEN_PRODUCTION 환경변수가 필요해요."

  local state="$STATE_DIR/$package_id.state.json"
  [[ -f "$state" ]] || die "prepare 기록이 없어요. 먼저 prepare를 실행해 주세요."
  [[ -z "$(state_get "$state" appliedAt)" ]] || die "이미 적용된 패키지예요. 다시 적용하지 않았어요."

  local expected remote_pkg backup
  expected="$(state_get "$state" packageChecksum)"
  remote_pkg="$(state_get "$state" remotePackage)"
  backup="$(state_get "$state" backupFile)"
  [[ "$checksum" == "$expected" ]] || die "체크섬이 dry-run 결과와 달라요. 승인이 무효라서 적용하지 않았어요."
  [[ -s "$backup" ]] || die "백업 파일이 없어요. 적용하지 않았어요: $backup"

  echo "적용: 체크섬 $checksum"
  local applied="$STATE_DIR/$package_id.apply.json"
  remote_import "ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1" "--package '$remote_pkg' --apply --expected-checksum $checksum" >"$applied" || true
  check_result "$applied" apply >/dev/null || die "적용 결과 검사에서 멈췄어요. $applied를 확인해 주세요."
  state_set "$state" "{\"appliedAt\":\"$(date -u +%FT%TZ)\"}"

  echo "읽어 보기: 같은 패키지로 dry-run을 다시 돌려 변경이 0건인지 확인해요."
  remote_import "" "--package '$remote_pkg' --dry-run" >"$applied.readback.json" || true
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (r.rejects.length > 0) { console.error("중단: 읽어 보기에서 거부가 나왔어요."); process.exit(1); }
    if (r.sideEffects.meaningfulChanges !== 0) { console.error("중단: 읽어 보기에서 변경이 남았어요. 확인해 주세요."); process.exit(1); }
    console.log("읽어 보기 통과: 추가 변경 0건");
  ' "$applied.readback.json"
  echo "적용 결과: $applied"
  echo "확인: preppy.kr 비교표와 기관 상세에서 값과 확인일을 봐 주세요."
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    prepare) cmd_prepare "$@" ;;
    apply) cmd_apply "$@" ;;
    *) die "사용법: $0 prepare --review <file> | apply --package-id <id> --checksum <sha256>" ;;
  esac
}

main "$@"
