import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import { NpmApiError } from "../error";
import { err, ok, type Result } from "../result";
import { z } from "zod";
import type { OtpOptions } from "./tokens";

export type { OtpOptions };

// The registry packument is a loose, CouchDB-revisioned document. We only
// touch a few known fields and pass the rest through verbatim on PUT, so the
// schema is permissive.
const PackumentSchema = z
  .object({
    _id: z.string().nullish(),
    _rev: z.string().nullish(),
    name: z.string().nullish(),
    "dist-tags": z.record(z.string(), z.string()).nullish(),
    versions: z.record(z.string(), z.record(z.string(), z.unknown())).nullish(),
    time: z.record(z.string(), z.string()).nullish(),
  })
  .passthrough();
type Packument = z.infer<typeof PackumentSchema>;

/** Outcome of an unpublish. */
export interface UnpublishResult {
  /** The version that was removed. */
  removedVersion: string;
  /** The package itself was fully removed (the version was its only one). */
  packageRemoved: boolean;
  /** The latest CouchDB revision after removal, if the package still exists. */
  newRev?: string;
}

/**
 * Remove a single **live published** version from the registry.
 *
 * Unlike `deleteStagePackageVersion` (which targets the staging area), this
 * operates on a version that has already gone live via `publish`. It follows
 * npm's single-version unpublish protocol:
 *
 * 1. `GET /<pkg>` — the current packument (with CouchDB `_rev`).
 * 2. Drop the version from `versions`/`time`, and reassign `dist-tags.latest`
 *    to the greatest remaining version.
 * 3. `PUT /<pkg>/-rev/<_rev>` — the modified packument.
 * 4. `GET /<pkg>` — the fresh `_rev`.
 * 5. `DELETE /<tarball>/-rev/<newRev>` — remove the tarball binary.
 *
 * If the removed version was the package's only version, step 5 becomes a full
 * `DELETE /<pkg>/-rev/<rev>` (whole-package removal).
 *
 * A version that does not exist returns ok early (matching official behavior).
 * Every write step requires 2FA, so `opts.otp` is mandatory.
 */
export async function unpublishPackage(
  pkg: string,
  version: string,
  opts: OtpOptions,
  client?: NpmClient | null,
): Promise<Result<UnpublishResult>> {
  const c = resolveClient(client);
  const esc = escapePackageName(pkg);
  const extra = {
    ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
    ...(opts.command ? { "npm-command": opts.command } : {}),
  };

  // Step 1: fetch the current packument + its CouchDB revision.
  const getRes = await c.request({ method: "GET", path: `/${esc}`, schema: PackumentSchema });
  if (!getRes.ok) return getRes as unknown as Result<UnpublishResult>;
  const pack = getRes.data as Packument;

  const versions = pack.versions ?? {};
  // Version doesn't exist → nothing to do (official npm behavior).
  if (!(version in versions)) {
    return ok(
      { removedVersion: version, packageRemoved: false },
      getRes.response as unknown as Result<UnpublishResult>["response"],
    );
  }

  const rev = pack._rev;
  if (!rev) {
    return err(
      new NpmApiError({
        status: getRes.response.status,
        message: "packument has no _rev",
        body: pack,
        headers: getRes.response.headers,
        request: { method: "GET", path: `/${esc}` },
      }),
      getRes.response as unknown as Result<UnpublishResult>["response"],
    );
  }

  // Step 2: build the modified packument.
  const tarballPath = extractTarballPath(versions[version]);
  const remainingVersions = withoutKey(versions, version);
  const remainingCount = Object.keys(remainingVersions).length;

  // Build the modified packument. Typed loosely since we mutate freely and
  // send it as a permissive PUT body; the strict Packment type was only needed
  // to validate the GET response above.
  const modified: Record<string, unknown> = { ...pack };
  if (pack.time) modified.time = withoutKey(pack.time, version);
  if (remainingCount === 0) {
    // removing the only version → whole-package removal below
    modified.versions = {};
  } else {
    modified.versions = remainingVersions;
    // reassign latest to the greatest remaining version if it pointed at us
    const distTags = { ...pack["dist-tags"] };
    if (distTags.latest === version) {
      distTags.latest = pickNextLatest(Object.keys(remainingVersions));
    }
    modified["dist-tags"] = distTags;
  }

  // Step 3: write the modified packument at the current revision.
  const putRes = await c.request({
    method: "PUT",
    path: `/${esc}/-rev/${encodeURIComponent(rev)}`,
    body: modified,
    schema: z.unknown(),
    otp: opts.otp,
    extraHeaders: extra,
  });
  if (!putRes.ok) return putRes as Result<UnpublishResult>;

  // Whole-package removal: delete the package doc itself.
  if (remainingCount === 0) {
    // re-fetch to get the new rev, then DELETE the whole package
    const reGet = await c.request({ method: "GET", path: `/${esc}`, schema: PackumentSchema });
    const newRev = reGet.ok ? (reGet.data as Packument)._rev : undefined;
    const delPath = newRev ? `/${esc}/-rev/${encodeURIComponent(newRev)}` : `/${esc}`;
    const delRes = await c.request({
      method: "DELETE",
      path: delPath,
      schema: z.unknown(),
      otp: opts.otp,
      extraHeaders: extra,
    });
    if (!delRes.ok) return delRes as Result<UnpublishResult>;
    return ok(
      { removedVersion: version, packageRemoved: true },
      delRes.response as unknown as Result<UnpublishResult>["response"],
    );
  }

  // Step 4: fetch the fresh revision.
  const reGet = await c.request({ method: "GET", path: `/${esc}`, schema: PackumentSchema });
  const newRev = reGet.ok ? (reGet.data as Packument)._rev : undefined;
  if (!newRev) {
    const error = reGet.ok
      ? new NpmApiError({
          status: reGet.response.status,
          message: "packument has no _rev after PUT",
          body: reGet.data,
          headers: reGet.response.headers,
          request: { method: "GET", path: `/${esc}` },
        })
      : reGet.error;
    return err(error, reGet.response as unknown as Result<UnpublishResult>["response"]);
  }

  // Step 5: remove the tarball binary at the new revision (if we know its path).
  if (tarballPath) {
    const delRes = await c.request({
      method: "DELETE",
      path: `${tarballPath}/-rev/${encodeURIComponent(newRev)}`,
      schema: z.unknown(),
      otp: opts.otp,
      extraHeaders: extra,
    });
    if (!delRes.ok) return delRes as Result<UnpublishResult>;
  }

  return ok(
    { removedVersion: version, packageRemoved: false, newRev },
    reGet.response as unknown as Result<UnpublishResult>["response"],
  );
}

// --- helpers ---------------------------------------------------------------

/** Pull the registry-relative tarball path (e.g. /<pkg>/-/<name>-<ver>.tgz). */
function extractTarballPath(versionEntry: unknown): string | undefined {
  if (!versionEntry || typeof versionEntry !== "object") return undefined;
  const dist = (versionEntry as Record<string, unknown>).dist;
  if (!dist || typeof dist !== "object") return undefined;
  const tarball = (dist as Record<string, unknown>).tarball;
  if (typeof tarball !== "string") return undefined;
  try {
    const u = new URL(tarball);
    return u.pathname;
  } catch {
    return tarball.startsWith("/") ? tarball : `/${tarball}`;
  }
}

/** Object spread that drops a key (keeps it plain/serializable). */
function withoutKey<T extends Record<string, unknown>>(
  obj: T,
  key: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== key) out[k] = v;
  }
  return out;
}

/**
 * Lightweight semver-ish comparison. Returns the greatest version string from
 * a non-empty list. Handles numeric dot segments (1.2.10 > 1.2.2); falls back
 * to lexicographic order for non-numeric/prerelease-ish segments.
 */
export function pickNextLatest(versions: string[]): string {
  if (versions.length === 0) throw new Error("no versions to pick from");
  let best = versions[0] as string;
  for (let i = 1; i < versions.length; i++) {
    const v = versions[i] as string;
    if (compareSemver(v, best) > 0) best = v;
  }
  return best;
}

/** Returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const pa = splitVer(a);
  const pb = splitVer(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai === bi) continue;
    return (ai as number) > (bi as number) ? 1 : -1;
  }
  return 0;
}

/** Split a version into comparable numeric/prerelease segments. */
function splitVer(v: string): (number | string)[] {
  // strip a leading v= and a build metadata (+...)
  const core = v.replace(/^v/, "").split("+")[0] as string;
  // numeric dot segments first; a trailing non-numeric part is kept as a string
  // segment (lower precedence than any number, mirroring semver prerelease).
  const parts: (number | string)[] = [];
  for (const seg of core.split(".")) {
    const n = Number(seg);
    parts.push(Number.isFinite(n) && seg !== "" ? n : seg);
  }
  return parts;
}
