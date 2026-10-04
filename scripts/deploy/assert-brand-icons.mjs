import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const approvedAssets = new Map([
  [
    "app/favicon.ico",
    "671fadf97d7fcebc85a97264d9a55e9c05620e4814994deb2b26764bbca79735",
  ],
  [
    "app/icon.png",
    "b815a6b369b626bbcf24ad24fce0951942ec01a4c98f88d44c1fb1b601070add",
  ],
  [
    "app/apple-icon.png",
    "3989274234e138ad8319ebe1c041d2c274282dfd8b428347c3a4843b59686afa",
  ],
  [
    "public/preppy-app-icon.png",
    "b815a6b369b626bbcf24ad24fce0951942ec01a4c98f88d44c1fb1b601070add",
  ],
  [
    "public/preppy-icon-192.png",
    "c8fd5ee2331b6b70d7483427e824fd5cf49eddcf18a472cefe0e6bc1b9d29b72",
  ],
  [
    "public/preppy-icon-512.png",
    "20b2614fd6d9fabe61cb5633c9877426ea5c67c0d34af40e362927b78cbc19bc",
  ],
]);

export function assertBrandIcons(
  read = (name) => readFileSync(path.join(root, name)),
) {
  for (const [name, expected] of approvedAssets) {
    const digest = createHash("sha256").update(read(name)).digest("hex");
    if (digest !== expected)
      throw new Error(`${name} does not match the approved PREPPY icon.`);
  }

  for (const [name, size] of [
    ["app/icon.png", 128],
    ["app/apple-icon.png", 180],
    ["public/preppy-icon-192.png", 192],
    ["public/preppy-icon-512.png", 512],
  ]) {
    const bytes = read(name);
    if (
      !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) !== size ||
      bytes.readUInt32BE(20) !== size
    )
      throw new Error(`${name} is not a ${size}x${size} PNG.`);
  }

  const favicon = read("app/favicon.ico");
  if (favicon.length < 6 || favicon.toString("hex", 0, 4) !== "00000100")
    throw new Error("app/favicon.ico is missing or invalid.");

  const manifest = JSON.parse(
    read("app/manifest.webmanifest").toString("utf8"),
  );
  for (const size of [192, 512]) {
    if (
      !manifest.icons?.some(
        (item) =>
          item.src === `/preppy-icon-${size}.png` &&
          item.sizes === `${size}x${size}` &&
          item.type === "image/png",
      )
    )
      throw new Error(`PREPPY manifest is missing the ${size}x${size} icon.`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertBrandIcons();
  process.stdout.write(
    "Approved PREPPY favicon, app icons, and manifest are present.\n",
  );
}
