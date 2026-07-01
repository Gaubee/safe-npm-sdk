/**
 * Pure utility to build a publish-ready packument from a package.json manifest
 * and a tarball buffer. Mirrors npm's `libnpmpublish` `buildMetadata`: computes
 * the sha512 integrity + sha1 shasum, base64-encodes the tarball, and assembles
 * the full `PUT /<pkg>` body shape.
 *
 * This is a **pure function with no client/IO dependency** — call it, then pass
 * its result to {@link publish}.
 *
 * @example
 * ```ts
 * import { readFileSync } from "node:fs";
 * import { buildPublishPackument, publish } from "safe-npm-sdk";
 *
 * const manifest = JSON.parse(readFileSync("package.json", "utf8"));
 * const tarball = readFileSync("my-pkg-1.0.0.tgz");
 * const packument = buildPublishPackument(manifest, tarball);
 * await publish(manifest.name, packument, { otp: "123456" });
 * ```
 */
import { createHash } from "node:crypto";
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
 * Build a publish-ready packument body from a manifest and tarball data.
 *
 * @param manifest - The package.json object; must have at least `name` and `version`.
 * @param tarballData - The packed `.tgz` contents (Buffer / Uint8Array).
 * @param opts - Optional tag / access / registry overrides.
 * @returns A {@link PublishPackument} ready to pass to {@link publish}.
 */
export function buildPublishPackument(
  manifest: Record<string, unknown>,
  tarballData: Uint8Array | ArrayBuffer | Buffer,
  opts: BuildPublishPackumentOptions = {},
): PublishPackument {
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

  // SRI integrity (sha512-<base64>) and shasum (sha1 hex).
  const integrity = `sha512-${createHash("sha512").update(buf).digest("base64")}`;
  const shasum = createHash("sha1").update(buf).digest("hex");
  const data = Buffer.from(buf).toString("base64");

  const dist = { integrity, shasum, tarball: tarballUrl };
  const versionId = `${name}@${version}`;

  // The version manifest = the full package.json, plus computed dist + _id.
  const versionManifest = { ...manifest, _id: versionId, dist };

  return {
    _id: versionId,
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
