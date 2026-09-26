# PREPPY Single-Image and Staging Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build one reviewable image from a fixed commit, verify that no local audit material enters it, and prepare isolated Staging services without changing Production.

**Architecture:** A multi-stage Dockerfile takes an explicit source allowlist and produces one runtime image that can start either the Next.js web server or the disabled Worker. GitHub Actions tests the image before publishing an immutable SHA tag and records its registry digest; Railway Staging gets an independent Postgres instance and web/Worker instances that refer to that digest. Production remains on its existing deployment until a separate release gate and Owner approval.

**Tech Stack:** Next.js 16.3, Node.js 22, npm, Docker Buildx, GitHub Actions, Railway, PostgreSQL.

**Spec:** docs/superpowers/specs/2026-09-16-preppy-staging-production-parity-design.md, especially sections 3, 4, 12, 16, and 17.

## Global Constraints

- Production DB write, deploy, service interruption, and preview shutdown require separate Owner approval.
- Staging has its own database and volume; never copy Production operational tables or secrets.
- Web and Worker must run the same image digest; Worker starts with WORKER_ENABLED=false, EMAIL_SEND_ENABLED=false, ANALYTICS_ENABLED=false, and CACHE_REVALIDATION_ENABLED=false.
- Build context and runtime image must not contain docs, data, environment files, Git metadata, or local audit artifacts.
- No GitHub workflow may automatically deploy to Production.
- The Docker build must not receive runtime DB URLs or authentication secrets.
- Staging readiness requires actual health, migration, desktop/mobile, and Admin checks; an image build alone is not a release.

---

### Task 1: Container image contract

**Files:**
- Create: Dockerfile
- Create: .dockerignore
- Modify: app/robots.ts
- Create: scripts/deploy/assert-image-contract.ts
- Test: tests/unit/image-contract.test.ts
- Test: GitHub Actions image smoke in Task 2

**Interfaces:**
- Consumes: existing npm scripts build, start, worker:once, db:migrate.
- Produces: one linux/amd64 image with default web command and Worker command override.

- [ ] **Step 1: Check the expected failure** — try a local Docker build; record the unavailable daemon or missing Dockerfile outcome before implementation.
- [ ] **Step 2: Add an allowlisted Docker context** — include only package manifests, Next config, TypeScript config, app, src, scripts, public, and types. Exclude all environment files even inside allowed directories.
- [ ] **Step 3: Add a two-stage Dockerfile** — install dependencies once, build Next.js once, copy only the allowlisted build tree into a non-root runtime image, and default to npm run start.
- [ ] **Step 4: Verify with a real image** — in CI, run the Worker with side effects disabled and assert the runtime filesystem has no docs, data, .env, .git, or audit file.
- [ ] **Step 5: Keep environment URLs at runtime** — the generic 404 build may use a non-public placeholder origin only if no placeholder survives in .next; robots.txt must be dynamic and CI must verify two different runtime origins.

### Task 2: Build-once CI and digest manifest

**Files:**
- Create: .github/workflows/release-image.yml

**Interfaces:**
- Consumes: Dockerfile and package scripts from Task 1.
- Produces: one registry image tagged with the exact Git SHA and a reported sha256 registry digest; no automatic Railway deployment.

- [ ] **Step 1: Define safety gates** — run npm ci, unit tests, and typecheck before the image build.
- [ ] **Step 2: Build exactly once** — load a linux/amd64 image locally, run the filesystem and disabled Worker smoke checks, then push that same image.
- [ ] **Step 3: Record immutable identity** — verify the pushed digest exists, print the Git SHA and digest to the job summary, and retain a manifest artifact.
- [ ] **Step 4: Push only the isolated branch** — verify Git status excludes the four local audit files and trigger CI without touching the Production-linked main branch.
- [ ] **Step 5: Review CI evidence** — require all checks and the image digest before any Staging image deployment.
- [ ] **Step 6: Verify registry access** — confirm an unauthenticated pull works, or confirm Staging has a read-only GHCR credential and a Railway plan that supports private registries. A digest without pull access is not deployable.

### Task 3: Isolated Staging topology

**Files:**
- Modify: Railway staging environment only; do not change repository runtime code in this task.
- Record: a non-secret Staging service/health/side-effect checklist in the plan outcome or a separate operations note.

**Interfaces:**
- Consumes: validated digest from Task 2 and an existing empty staging environment.
- Produces: Staging Postgres with an independent volume, plus web and disabled Worker service instances.

- [ ] **Step 1: Re-read environment inventory** — verify the selected Railway project/environment IDs and that staging has no services or volumes.
- [ ] **Step 2: Provision Staging Postgres** — confirm the new service and volume belong only to staging, not production.
- [ ] **Step 3: Configure Staging web** — pin the validated image digest, set Staging DATABASE_URL reference, APP_BASE_URL, connection budget, PREPPY_ENVIRONMENT=STAGING, healthcheck, and separate authentication secrets.
- [ ] **Step 4: Configure Staging Worker** — pin the identical image digest and set all four side-effect flags to false; retain a separate start command.
- [ ] **Step 5: Migrate and smoke test Staging** — migrate only its DB, verify web and Admin behavior, compare image digest across web/Worker, and check desktop/mobile. If credentials or registry access are missing, stop before deployment and report the exact gap.

## Self-review and release boundary

- This plan implements only approved design stages 2-3. It does not implement content release, canonical parity, Production Admin OIDC, Production deploy, or static-data synchronization.
- Container and CI checks are not substitutes for Staging health or user-visible UX review.
- UX Writing: N/A for container/CI files because they do not change public or Admin copy; if Staging shows existing copy incorrectly, report FIX_REQUIRED rather than calling the release ready.
