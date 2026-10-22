import { fileURLToPath } from "node:url";
import path from "node:path";

import { checkReleaseBaseline } from "./check-release-baseline.mjs";

// Promotes one already-built, CI-verified image digest. It never builds or
// uploads source, so it cannot replace `railway up` with a branch snapshot.
const API = "https://backboard.railway.com/graphql/v2";
const PROJECT_ID = "de1e9ea9-f920-47a4-aedc-095252ee8e49";
export const RELEASE_TARGETS = {
  staging: {
    tokenVariable: "RAILWAY_TOKEN_STAGING",
    environmentId: "94d9b877-5fb2-49f1-87d9-4e939a3db7d2",
    web: "c6c49fbf-b7d6-4806-a358-97ab4613dd7a",
    worker: "2bb518a6-d8d7-40d9-900e-f392eb44329c",
  },
  production: {
    tokenVariable: "RAILWAY_TOKEN_PRODUCTION",
    environmentId: "f3eb0933-6bef-4947-98f0-2b1bff9bea73",
    web: "26c2ce4f-3214-426f-9bc5-f960b25ab7b7",
    worker: "35bfe5d0-2338-4c5e-85a5-4296710f0c15",
  },
};
const IMAGE_PATTERN = /^ghcr\.io\/potensiainc\/preppy@sha256:[a-f0-9]{64}$/;
const TERMINAL = new Set(["SUCCESS", "FAILED", "CRASHED", "REMOVED"]);

export function parseReleaseArgs(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const target = value("--target");
  const image = value("--image");
  if (!Object.hasOwn(RELEASE_TARGETS, target ?? ""))
    throw new Error("--target must be staging or production.");
  if (!IMAGE_PATTERN.test(image ?? ""))
    throw new Error(
      "--image must be ghcr.io/potensiainc/preppy@sha256:<digest> from the release-image workflow.",
    );
  return { target, image, apply: argv.includes("--apply") };
}

// Production only receives the exact image both Staging services already
// run healthily, so a failed Staging worker cannot be skipped.
export function assertStagingVerified(stagingServices, image) {
  if (
    !stagingServices.every(
      (service) => service.image === image && service.status === "SUCCESS",
    )
  )
    throw new Error(
      "Deploy and verify this image on staging before production.",
    );
}

// release-image publishes main and other branches; only the image built
// from the preflighted commit may ship.
export function assertImageBuiltFrom(image, publishedDigest) {
  if (image !== `ghcr.io/potensiainc/preppy@${publishedDigest}`)
    throw new Error(
      "--image must be the release-image digest of the checked-out commit.",
    );
}

async function publishedDigestFor(gitSha) {
  const repository = "potensiainc/preppy";
  const auth = await fetch(
    `https://ghcr.io/token?scope=repository:${repository}:pull`,
  );
  const { token } = await auth.json();
  const response = await fetch(
    `https://ghcr.io/v2/${repository}/manifests/sha-${gitSha}`,
    {
      method: "HEAD",
      headers: {
        authorization: `Bearer ${token}`,
        accept: [
          "application/vnd.oci.image.index.v1+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.docker.distribution.manifest.v2+json",
        ].join(", "),
      },
    },
  );
  const digest = response.headers.get("docker-content-digest");
  if (!response.ok || !digest)
    throw new Error(`No release image was published for commit ${gitSha}.`);
  return digest;
}

function client(token) {
  return async (query, variables = {}) => {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Project-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    if (!response.ok || body.errors)
      throw new Error(
        `Railway API error: ${JSON.stringify(body.errors ?? response.status)}`,
      );
    return body.data;
  };
}

function tokenFor(target) {
  const token = process.env[RELEASE_TARGETS[target].tokenVariable];
  if (!token)
    throw new Error(`${RELEASE_TARGETS[target].tokenVariable} must be set.`);
  return token;
}

async function serviceState(request, environmentId, serviceId) {
  const data = await request(
    `query($s: String!, $e: String!) {
      serviceInstance(serviceId: $s, environmentId: $e) {
        source { image }
        latestDeployment { id status }
      }
    }`,
    { s: serviceId, e: environmentId },
  );
  const instance = data.serviceInstance;
  return {
    image: instance.source?.image ?? null,
    deploymentId: instance.latestDeployment?.id ?? null,
    status: instance.latestDeployment?.status ?? null,
  };
}

async function waitForDeployment(request, deploymentId) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const { deployment } = await request(
      "query($id: String!) { deployment(id: $id) { status } }",
      { id: deploymentId },
    );
    if (TERMINAL.has(deployment.status)) return deployment.status;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  // A queued deployment can resume later and cut over on its own; cancel it
  // so a timeout never leaves web and worker on different images.
  await request("mutation($id: String!) { deploymentCancel(id: $id) }", {
    id: deploymentId,
  });
  return "TIMED_OUT";
}

async function release({ target, image, apply }) {
  const baseline = checkReleaseBaseline();
  assertImageBuiltFrom(image, await publishedDigestFor(baseline.gitSha));
  const config = RELEASE_TARGETS[target];
  const request = client(tokenFor(target));
  const { projectToken } = await request(
    "query { projectToken { projectId environmentId } }",
  );
  if (
    projectToken.projectId !== PROJECT_ID ||
    projectToken.environmentId !== config.environmentId
  )
    throw new Error(`The ${config.tokenVariable} token is not for ${target}.`);

  if (target === "production") {
    const staging = RELEASE_TARGETS.staging;
    const stagingRequest = client(tokenFor("staging"));
    assertStagingVerified(
      [
        await serviceState(stagingRequest, staging.environmentId, staging.web),
        await serviceState(
          stagingRequest,
          staging.environmentId,
          staging.worker,
        ),
      ],
      image,
    );
  }

  const before = {
    web: await serviceState(request, config.environmentId, config.web),
    worker: await serviceState(request, config.environmentId, config.worker),
  };
  if (!apply) return { mode: "DRY_RUN", target, image, baseline, before };

  // Web first: its healthcheck (/api/release-integrity) must pass before
  // the worker cron picks up the same image.
  const deployments = {};
  for (const role of ["web", "worker"]) {
    const serviceId = config[role];
    await request(
      `mutation($s: String!, $e: String!, $i: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: $i)
      }`,
      { s: serviceId, e: config.environmentId, i: { source: { image } } },
    );
    const { serviceInstanceDeployV2: deploymentId } = await request(
      `mutation($s: String!, $e: String!) {
        serviceInstanceDeployV2(serviceId: $s, environmentId: $e)
      }`,
      { s: serviceId, e: config.environmentId },
    );
    const status = await waitForDeployment(request, deploymentId);
    deployments[role] = { deploymentId, status };
    if (status !== "SUCCESS")
      return { mode: "FAILED", target, image, baseline, before, deployments };
  }
  return { mode: "APPLIED", target, image, baseline, before, deployments };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await release(parseReleaseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.mode === "FAILED") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
