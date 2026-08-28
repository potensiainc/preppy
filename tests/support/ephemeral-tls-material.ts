import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generate } from "selfsigned";

export type EphemeralTlsMaterial = Readonly<{
  directory: string;
  caCertificatePath: string;
  caPrivateKeyPath: string;
  certificatePath: string;
  privateKeyPath: string;
  caCertificate: Buffer;
  certificate: Buffer;
  privateKey: Buffer;
  cleanup(): Promise<void>;
}>;

const TEST_HOSTNAME = "school.fixture.test";

export async function createEphemeralTlsMaterial(): Promise<EphemeralTlsMaterial> {
  const directory = await mkdtemp(join(tmpdir(), "preppy-http-collector-tls-"));
  const caCertificatePath = join(directory, "test-ca.cert.pem");
  const caPrivateKeyPath = join(directory, "test-ca.key.pem");
  const certificatePath = join(directory, "server.cert.pem");
  const privateKeyPath = join(directory, "server.key.pem");

  try {
    const notBeforeDate = new Date(Date.now() - 60_000);
    const notAfterDate = new Date(Date.now() + 86_400_000);
    const ca = await generate(
      [
        {
          name: "commonName",
          value: "PREPPY ephemeral HTTP collector test CA",
        },
      ],
      {
        algorithm: "sha256",
        keyType: "ec",
        curve: "P-256",
        notBeforeDate,
        notAfterDate,
        extensions: [
          { name: "basicConstraints", cA: true, critical: true },
          {
            name: "keyUsage",
            keyCertSign: true,
            cRLSign: true,
            critical: true,
          },
        ],
      },
    );
    const server = await generate(
      [{ name: "commonName", value: TEST_HOSTNAME }],
      {
        algorithm: "sha256",
        keyType: "ec",
        curve: "P-256",
        notBeforeDate,
        notAfterDate,
        ca: { key: ca.private, cert: ca.cert },
        extensions: [
          { name: "basicConstraints", cA: false, critical: true },
          { name: "keyUsage", digitalSignature: true, critical: true },
          { name: "extKeyUsage", serverAuth: true },
          {
            name: "subjectAltName",
            altNames: [{ type: 2, value: TEST_HOSTNAME }],
            critical: true,
          },
        ],
      },
    );

    await Promise.all([
      writeFile(caCertificatePath, ca.cert, { mode: 0o600 }),
      writeFile(caPrivateKeyPath, ca.private, { mode: 0o600 }),
      writeFile(certificatePath, server.cert, { mode: 0o600 }),
      writeFile(privateKeyPath, server.private, { mode: 0o600 }),
    ]);
    const [caCertificate, certificate, privateKey] = await Promise.all([
      readFile(caCertificatePath),
      readFile(certificatePath),
      readFile(privateKeyPath),
    ]);

    return {
      directory,
      caCertificatePath,
      caPrivateKeyPath,
      certificatePath,
      privateKeyPath,
      caCertificate,
      certificate,
      privateKey,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
