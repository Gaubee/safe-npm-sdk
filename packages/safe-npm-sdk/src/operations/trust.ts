import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import { VoidSchema } from "../schemas/common";
import {
  type TrustedPublisherConfigCreate,
  TrustedPublisherConfigCreateSchema,
  type TrustedPublisherConfigs,
  TrustedPublisherConfigsSchema,
} from "../schemas/trust";
import type { OtpOptions } from "./tokens";

export type { OtpOptions };

/**
 * Get all trusted publisher configurations for a package.
 *
 * `GET /-/package/{package}/trust`
 *
 * Requires 2FA (an `otp`).
 */
export async function getTrustedPublishers(
  pkg: string,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<TrustedPublisherConfigs>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/package/${escapePackageName(pkg)}/trust`,
    schema: TrustedPublisherConfigsSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Add a trusted publisher configuration for a package.
 *
 * `POST /-/package/{package}/trust`
 *
 * Requires 2FA (an `otp`).
 */
export async function configureTrustedPublisher(
  pkg: string,
  config: TrustedPublisherConfigCreate,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<TrustedPublisherConfigs>> {
  const c = resolveClient(client);
  const parsed = TrustedPublisherConfigCreateSchema.parse(config);
  // The registry expects an ARRAY of configs, even for a single entry.
  return c.request({
    method: "POST",
    path: `/-/package/${escapePackageName(pkg)}/trust`,
    body: [parsed],
    schema: TrustedPublisherConfigsSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Delete a trusted publisher configuration.
 *
 * `DELETE /-/package/{package}/trust/{config-uuid}`
 *
 * Requires 2FA (an `otp`).
 */
export async function deleteTrustedPublisher(
  params: { package: string; configUuid: string },
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "DELETE",
    path: `/-/package/${escapePackageName(params.package)}/trust/${encodeURIComponent(params.configUuid)}`,
    schema: VoidSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}
