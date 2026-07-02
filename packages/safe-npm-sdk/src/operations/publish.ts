import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import {
  type PublishPackument,
  PublishPackumentSchema,
  type PublishSuccess,
  PublishSuccessSchema,
} from "../schemas/publish";
import type { OtpOptions } from "./tokens";

export type { OtpOptions as PublishOptions };

/**
 * Publish a new version of a package.
 *
 * `PUT /{escapedPackageName}`
 *
 * The body is a packument containing the version manifest and tarball
 * attachments (base64-encoded). The package name is automatically URL-escaped
 * for scoped packages.
 *
 * `opts.otp` is **required** (npm write operations generally need 2FA). Pass
 * the OTP code, or `null` only if you're certain 2FA is disabled. Build the
 * packument easily with `buildPublishPackument(manifest, tarballData)`.
 */
export async function publish(
  pkg: string,
  packument: PublishPackument,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<PublishSuccess>> {
  const c = resolveClient(client);
  const body = PublishPackumentSchema.parse(packument);
  return c.request({
    method: "PUT",
    path: `/${escapePackageName(pkg)}`,
    body,
    schema: PublishSuccessSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}
