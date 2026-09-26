type Environment = Record<string, string | undefined>;

// Railway's own environment name takes priority so a mistyped application
// flag cannot make Staging indexable or accidentally deindex Production.
export function isStagingEnvironment(
  environment: Environment = process.env,
): boolean {
  const railwayName =
    environment.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  if (railwayName === "staging") return true;
  if (railwayName === "production") return false;
  if (railwayName) return true;
  return environment.PREPPY_ENVIRONMENT?.trim().toUpperCase() === "STAGING";
}

export function hasDeploymentEnvironmentMismatch(
  environment: Environment = process.env,
): boolean {
  const railwayName =
    environment.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  const preppyName = environment.PREPPY_ENVIRONMENT?.trim().toLowerCase();
  return (
    (railwayName === "staging" || railwayName === "production") &&
    preppyName !== railwayName
  );
}
