export function assertDedicatedTestDatabaseUrl(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);

  if (!/(?:^|_)(?:test|verify\d*)$/.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL must target a dedicated database ending in _test or _verify<digits>",
    );
  }
}
