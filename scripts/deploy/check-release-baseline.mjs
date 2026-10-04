import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

export function assertReleaseBaseline({ dirty, includesMain }) {
  if (dirty)
    throw new Error(
      "Commit or isolate working tree changes before deployment.",
    );
  if (!includesMain)
    throw new Error(
      "Deployment blocked: merge the latest origin/main before releasing.",
    );
}

export function checkReleaseBaseline() {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  // Fetch failure must stop the release; a stale local ref is not evidence.
  git("fetch", "origin", "refs/heads/main:refs/remotes/origin/main");
  let includesMain = false;
  try {
    git("merge-base", "--is-ancestor", "origin/main", "HEAD");
    includesMain = true;
  } catch {
    /* fail closed */
  }
  assertReleaseBaseline({
    dirty: git("status", "--porcelain").length > 0,
    includesMain,
  });
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/deploy/assert-header-auth-absence.mjs")],
    { cwd: root, stdio: "inherit" },
  );
  const release = {
    gitSha: git("rev-parse", "HEAD"),
    mainSha: git("rev-parse", "origin/main"),
  };
  process.stdout.write(`${JSON.stringify(release)}\n`);
  return release;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  checkReleaseBaseline();
