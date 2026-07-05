/**
 * Pure utility to build a publish-ready packument from a package.json manifest
 * and a tarball buffer. Mirrors npm's `libnpmpublish` `buildMetadata`: computes
 * the sha512 integrity + sha1 shasum, base64-encodes the tarball, and assembles
 * the full `PUT /<pkg>` body shape.
 *
 * This is a **pure utility with no client/IO dependency** — call it, then pass
 * its result to {@link publish}. It is async because hashing goes through the
 * Web Crypto API (`globalThis.crypto.subtle`), which is natively available in
 * browsers and Node 18+, so the same function works cross-platform with zero
 * Node-only imports.
 *
 * @example
 * ```ts
 * import { readFileSync } from "node:fs";
 * import { buildPublishPackument, publish } from "safe-npm-sdk";
 *
 * const manifest = JSON.parse(readFileSync("package.json", "utf8"));
 * const tarball = readFileSync("my-pkg-1.0.0.tgz");
 * const packument = await buildPublishPackument(manifest, tarball);
 * await publish(manifest.name, packument, { otp: "123456" });
 * ```
 */
import type { PublishPackument } from "./schemas/publish";

/** Options for {@link buildPublishPackument}. */
export interface BuildPublishPackumentOptions {
  /** dist-tag to point at the new version. Defaults to `"latest"`. */
  tag?: string;
  /** Access level. Defaults to `"public"` for unscoped, `"restricted"` for scoped. */
  access?: "public" | "restricted";
  /** Registry base URL, used to build the tarball URL. Defaults to the public registry. */
  registry?: string;
}

/**
 * Compute a hash digest of `data` with the given Web Crypto algorithm name
 * (e.g. `"SHA-512"`, `"SHA-1"`), returned as a lowercase hex string. Works in
 * browsers and Node 18+ via `globalThis.crypto.subtle`.
 */
async function digestHex(algorithm: string, data: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(algorithm, data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Base64-encode a Uint8Array without relying on Node's Buffer. */
function toBase64(data: Uint8Array): string {
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  // btoa is available in browsers and Node 16+.
  const encoder =
    typeof btoa === "function" ? btoa : (s: string) => Buffer.from(s, "binary").toString("base64");
  return encoder(binary);
}

/**
 * Build a publish-ready packument body from a manifest and tarball data.
 *
 * @param manifest - The package.json object; must have at least `name` and `version`.
 * @param tarballData - The packed `.tgz` contents (Uint8Array / ArrayBuffer / Buffer).
 * @param opts - Optional tag / access / registry overrides.
 * @returns A {@link PublishPackument} ready to pass to {@link publish}.
 */
export async function buildPublishPackument(
  manifest: Record<string, unknown>,
  tarballData: Uint8Array | ArrayBuffer | Buffer,
  opts: BuildPublishPackumentOptions = {},
): Promise<PublishPackument> {
  // Coerce name/version defensively; they're `unknown` from the manifest type.
  const nameRaw = manifest.name;
  const versionRaw = manifest.version;
  const name = typeof nameRaw === "string" ? nameRaw : "";
  const version = typeof versionRaw === "string" ? versionRaw : "";
  if (!name || !version) {
    throw new Error("buildPublishPackument: manifest must have non-empty name and version");
  }

  const buf = tarballData as Uint8Array;
  const tag = opts.tag ?? "latest";
  const isScoped = name.startsWith("@");
  const access = opts.access ?? (isScoped ? "restricted" : "public");
  const registry = (opts.registry ?? "https://registry.npmjs.org").replace(/\/+$/, "");

  // Tarball filename: scoped packages drop the scope and the "/".
  // @scope/pkg → scope-pkg; the registry's convention is <name without scope>-<version>.tgz
  const tarballBase = name.replace(/^@/, "").replace(/\//g, "-");
  const tarballName = `${tarballBase}-${version}.tgz`;
  const tarballUrl = `${registry}/${name}/-/${tarballName}`;

  // SRI integrity (sha512-<base64>) and shasum (sha1 hex), via the cross-platform
  // Web Crypto API — no node:crypto import, so this runs in browsers too.
  const sha512Hex = await digestHex("SHA-512", buf);
  const sha1Hex = await digestHex("SHA-1", buf);
  // integrity is the sha512 digest as base64 (hex → bytes → base64)
  const integrity = `sha512-${hexToBase64(sha512Hex)}`;
  const shasum = sha1Hex;
  const data = toBase64(buf);

  const dist = { integrity, shasum, tarball: tarballUrl };
  const versionId = `${name}@${version}`;

  // The version manifest = the full package.json, plus computed dist + _id.
  const versionManifest = { ...manifest, _id: versionId, dist };

  // Top-level _id is the bare package name — NOT "name@version". The npm
  // registry (CouchDB frontdoor) keys the packument document by the package
  // name, so a top-level _id of "name@version" mismatches the existing doc
  // and the registry rejects the PUT with "404 Failed to save packument".
  // Mirrors libnpmpublish's buildMetadata: root._id = manifest.name, while
  // only the per-version entry carries the "name@version" _id.
  return {
    _id: name,
    name,
    ...(typeof manifest.description === "string" ? { description: manifest.description } : {}),
    "dist-tags": { [tag]: version },
    versions: { [version]: versionManifest },
    _attachments: {
      [tarballName]: {
        content_type: "application/octet-stream",
        data,
        length: buf.length,
      },
    },
    access,
  } as PublishPackument;
}

/** Convert a hex string to base64 (used to build the SRI integrity value). */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes.set([Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)], i);
  }
  return toBase64(bytes);
}
