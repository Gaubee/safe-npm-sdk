import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import { VoidSchema } from "../schemas/common";
import {
  type ApproveStageResponse,
  ApproveStageResponseSchema,
  type StageListInput,
  type StagePackageList,
  StagePackageListSchema,
  type StagePackageVersion,
  type StagePackageVersionResponse,
  StagePackageVersionResponseSchema,
  StagePackageVersionSchema,
  type StagedPackumentRequest,
  StagedPackumentRequestSchema,
} from "../schemas/stage";
import type { OtpOptions } from "./tokens";

export type { OtpOptions };

/**
 * Fetch a list of all staged package versions for the authenticated user.
 *
 * `GET /-/stage`
 */
export async function getStageItems(
  input: StageListInput = {},
  client?: NpmClient | null,
): Promise<Result<StagePackageList>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: "/-/stage",
    query: {
      package: input.package,
      page: input.page,
      perPage: input.perPage,
    },
    schema: StagePackageListSchema,
  });
}

/**
 * Publish a package version to staging for review by maintainers.
 *
 * `POST /-/stage/package/{package-name}`
 */
export async function stagePackageVersion(
  packageName: string,
  packument: StagedPackumentRequest,
  client?: NpmClient | null,
): Promise<Result<StagePackageVersionResponse>> {
  const c = resolveClient(client);
  const body = StagedPackumentRequestSchema.parse(packument);
  return c.request({
    method: "POST",
    path: `/-/stage/package/${escapePackageName(packageName)}`,
    body,
    schema: StagePackageVersionResponseSchema,
  });
}

/**
 * Get details about a specific staged package version.
 *
 * `GET /-/stage/{stage-id}`
 */
export async function getStagePackageVersion(
  stageId: string,
  client?: NpmClient | null,
): Promise<Result<StagePackageVersion>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/stage/${encodeURIComponent(stageId)}`,
    schema: StagePackageVersionSchema,
  });
}

/**
 * Delete a staged package version. Requires 2FA (an `otp`).
 *
 * `DELETE /-/stage/{stage-id}`
 */
export async function deleteStagePackageVersion(
  stageId: string,
  opts: OtpOptions,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "DELETE",
    path: `/-/stage/${encodeURIComponent(stageId)}`,
    schema: VoidSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Approve a staged package version, publishing it to the npm registry.
 * Requires 2FA (an `otp`).
 *
 * `POST /-/stage/{stage-id}/approve`
 */
export async function approveStagePackageVersion(
  stageId: string,
  opts: OtpOptions,
  client?: NpmClient | null,
): Promise<Result<ApproveStageResponse>> {
  const c = resolveClient(client);
  return c.request({
    method: "POST",
    path: `/-/stage/${encodeURIComponent(stageId)}/approve`,
    schema: ApproveStageResponseSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Get the tarball for a staged package version. Returns the raw response
 * metadata; the binary body lives in `response.body` (a string).
 *
 * `GET /-/stage/{stage-id}/tarball`
 */
export async function getStagePackageTarball(
  stageId: string,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/stage/${encodeURIComponent(stageId)}/tarball`,
    schema: VoidSchema,
  });
}
