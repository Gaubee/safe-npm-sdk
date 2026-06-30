import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import {
  type GrantTeamPackageInput,
  GrantTeamPackageInputSchema,
  type PackageAccessLevels,
  PackageAccessLevelsSchema,
  type PackageVisibilityMap,
  PackageVisibilityMapSchema,
  type SetPackageAccessInput,
  SetPackageAccessInputSchema,
  type UserAccessLevels,
  UserAccessLevelsSchema,
} from "../schemas/access";
import { VoidSchema } from "../schemas/common";

/**
 * Get all packages granted to a team.
 *
 * `GET /-/team/{orgName}/{teamName}/package`
 */
export async function getTeamPackageGrants(
  params: { org: string; team: string },
  client?: NpmClient | null,
): Promise<Result<PackageAccessLevels>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/team/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/package`,
    schema: PackageAccessLevelsSchema,
  });
}

/**
 * Grant a team access to a package.
 *
 * `PUT /-/team/{orgName}/{teamName}/package`
 */
export async function createTeamPackageGrant(
  params: { org: string; team: string },
  input: GrantTeamPackageInput,
  client?: NpmClient | null,
): Promise<Result<PackageAccessLevels>> {
  const c = resolveClient(client);
  const body = GrantTeamPackageInputSchema.parse(input);
  return c.request({
    method: "PUT",
    path: `/-/team/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/package`,
    body,
    schema: PackageAccessLevelsSchema,
  });
}

/**
 * Remove a team's access to a package.
 *
 * `DELETE /-/team/{orgName}/{teamName}/package?package={pkg}`
 */
export async function deleteTeamPackageGrant(
  params: { org: string; team: string; package: string },
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "DELETE",
    path: `/-/team/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/package`,
    query: { package: params.package },
    schema: VoidSchema,
  });
}

/**
 * Get all packages in an org (with their access levels).
 *
 * `GET /-/org/{orgName}/package`
 */
export async function getOrgPackages(
  org: string,
  client?: NpmClient | null,
): Promise<Result<PackageAccessLevels>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/org/${encodeURIComponent(org)}/package`,
    schema: PackageAccessLevelsSchema,
  });
}

/**
 * Get all users that have access to a package, with their access levels.
 *
 * `GET /-/package/{escapedPackageName}/collaborators`
 */
export async function getPackageCollaborators(
  pkg: string,
  client?: NpmClient | null,
): Promise<Result<UserAccessLevels>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/package/${escapePackageName(pkg)}/collaborators`,
    schema: UserAccessLevelsSchema,
  });
}

/**
 * Get the visibility (public/private) of a package.
 *
 * `GET /-/package/{escapedPackageName}/visibility`
 */
export async function getPackageVisibility(
  pkg: string,
  client?: NpmClient | null,
): Promise<Result<PackageVisibilityMap>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/package/${escapePackageName(pkg)}/visibility`,
    schema: PackageVisibilityMapSchema,
  });
}

/**
 * Set access/visibility options for a package (e.g. require 2FA to publish).
 *
 * `POST /-/package/{escapedPackageName}/access`
 */
export async function setPackageAccess(
  pkg: string,
  input: SetPackageAccessInput,
  client?: NpmClient | null,
): Promise<Result<PackageAccessLevels>> {
  const c = resolveClient(client);
  const body = SetPackageAccessInputSchema.parse(input);
  return c.request({
    method: "POST",
    path: `/-/package/${escapePackageName(pkg)}/access`,
    body,
    schema: PackageAccessLevelsSchema,
  });
}
