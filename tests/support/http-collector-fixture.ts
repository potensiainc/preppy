import { createServer, type RequestListener, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createSecureContext, type TLSSocket } from "node:tls";

export type HttpCollectorFixture = Readonly<{
  port: number;
  requests: Array<Readonly<{ method: string; url: string; host: string }>>;
  tlsServerNames: string[];
  close(): Promise<void>;
}>;

export async function startHttpCollectorFixture(
  listener: RequestListener,
): Promise<HttpCollectorFixture> {
  const requests: HttpCollectorFixture["requests"] = [];
  const server: Server = createServer((request, response) => {
    requests.push({
      method: request.method ?? "",
      url: request.url ?? "",
      host: request.headers.host ?? "",
    });
    listener(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("HTTP collector fixture did not bind an IPv4 port");
  }
  return {
    port: address.port,
    requests,
    tlsServerNames: [],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function startHttpsCollectorFixture(
  listener: RequestListener,
  credentials: Readonly<{ key: string | Buffer; cert: string | Buffer }>,
): Promise<HttpCollectorFixture> {
  const requests: HttpCollectorFixture["requests"] = [];
  const tlsServerNames: string[] = [];
  const secureContext = createSecureContext(credentials);
  const server = createHttpsServer(
    {
      ...credentials,
      SNICallback: (servername, callback) => {
        tlsServerNames.push(servername);
        callback(null, secureContext);
      },
    },
    (request, response) => {
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        host: request.headers.host ?? "",
      });
      listener(request, response);
    },
  );
  server.on("secureConnection", (socket: TLSSocket) => {
    if (socket.servername) tlsServerNames.push(socket.servername);
  });
  server.on("tlsClientError", (_error, socket: TLSSocket) => {
    if (socket.servername) tlsServerNames.push(socket.servername);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("HTTPS collector fixture did not bind an IPv4 port");
  }
  return {
    port: address.port,
    requests,
    tlsServerNames,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
