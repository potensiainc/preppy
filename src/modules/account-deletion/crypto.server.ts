import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export function deletionKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("DELETION_KEY_INVALID");
  return Buffer.from(secret, "hex");
}
export function subjectFingerprint(subject: string) {
  return createHash("sha256")
    .update("kakao-deletion:")
    .update(subject)
    .digest("hex");
}
export function encryptSubject(subject: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deletionKey(secret), iv);
  cipher.setAAD(Buffer.from("preppy-deletion-v1"));
  const data = Buffer.concat([cipher.update(subject, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function decryptSubject(value: string, secret: string) {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deletionKey(secret),
    data.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from("preppy-deletion-v1"));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
