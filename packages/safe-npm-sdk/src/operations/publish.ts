import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import {
  type PublishPackument,
  PublishPackumentSchema,
  type PublishSuccess,
  PublishSuccessSchema,
} from "../schemas/publish";

/** Options for publishing. */
export interface PublishOptions {
  /** One-time password for 2FA, if required by the account/package. */
  otp?: string;
}

/**
 * Publish a new version of a package.
 *
 * `PUT /{escapedPackageName}`
 *
 * The body is a packument containing the version manifest and tarball
 * attachments (base64-encoded). The package name is automatically URL-escaped
 * for scoped packages.
 */
export async function publish(
  pkg: string,
  packument: PublishPackument,
  opts: PublishOptions = {},
  client?: NpmClient | null,
): Promise<Result<PublishSuccess>> {
  const c = resolveClient(client);
  const body = PublishPackumentSchema.parse(packument);
  return c.request({
    method: "PUT",
    path: `/${escapePackageName(pkg)}`,
    body,
    schema: PublishSuccessSchema,
    ...(opts.otp !== undefined ? { otp: opts.otp } : {}),
  });
}
