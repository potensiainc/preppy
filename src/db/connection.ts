import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
let connectedUrl: string | undefined;

function getClient(databaseUrl: string): ReturnType<typeof postgres> {
  if (client && connectedUrl !== databaseUrl) {
    throw new Error(
      "The database connection is already configured for another URL",
    );
  }

  client ??= postgres(databaseUrl, { max: 1 });
  connectedUrl = databaseUrl;
  return client;
}

export async function checkDatabaseConnection(
  databaseUrl: string,
): Promise<boolean> {
  const sql = getClient(databaseUrl);
  const [result] = await sql<{ ready: number }[]>`select 1 as ready`;
  return result?.ready === 1;
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
  }

  client = undefined;
  connectedUrl = undefined;
}
