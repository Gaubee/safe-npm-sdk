import { type NpmClient, resolveClient } from "../client";
import type { Result } from "../result";
import { VoidSchema } from "../schemas/common";
import {
  type ChangeOrgMembershipInput,
  ChangeOrgMembershipInputSchema,
  type CreateTeamInput,
  CreateTeamInputSchema,
  type OrgInvite,
  OrgInviteSchema,
  type OrgMembers,
  OrgMembersSchema,
  type OrgTeams,
  OrgTeamsSchema,
  type RemoveOrgMemberInput,
  RemoveOrgMemberInputSchema,
  type TeamMemberInput,
  TeamMemberInputSchema,
  type TeamUsers,
  TeamUsersSchema,
} from "../schemas/org-team";

// ---------------------------------------------------------------------------
// Org membership
// ---------------------------------------------------------------------------

/**
 * Get users in an org (username -> role).
 *
 * `GET /-/org/{orgName}/user`
 */
export async function getOrgMembership(
  org: string,
  client?: NpmClient | null,
): Promise<Result<OrgMembers>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/org/${encodeURIComponent(org)}/user`,
    schema: OrgMembersSchema,
  });
}

/**
 * Set/update a user's membership in an org.
 *
 * `PUT /-/org/{orgName}/user`
 */
export async function changeOrgMembership(
  org: string,
  input: ChangeOrgMembershipInput,
  client?: NpmClient | null,
): Promise<Result<OrgInvite>> {
  const c = resolveClient(client);
  const body = ChangeOrgMembershipInputSchema.parse(input);
  return c.request({
    method: "PUT",
    path: `/-/org/${encodeURIComponent(org)}/user`,
    body,
    schema: OrgInviteSchema,
  });
}

/**
 * Remove a user's membership from an org.
 *
 * `DELETE /-/org/{orgName}/user`
 */
export async function deleteOrgMembership(
  org: string,
  input: RemoveOrgMemberInput,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  const body = RemoveOrgMemberInputSchema.parse(input);
  return c.request({
    method: "DELETE",
    path: `/-/org/${encodeURIComponent(org)}/user`,
    body,
    schema: VoidSchema,
  });
}

/**
 * Get teams in an org/scope.
 *
 * `GET /-/org/{orgName}/team`
 */
export async function getScopeTeams(
  org: string,
  client?: NpmClient | null,
): Promise<Result<OrgTeams>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/org/${encodeURIComponent(org)}/team`,
    schema: OrgTeamsSchema,
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Create a new team in an org/scope.
 *
 * `PUT /-/org/{orgName}/team`
 */
export async function createTeam(
  org: string,
  input: CreateTeamInput,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  const body = CreateTeamInputSchema.parse(input);
  return c.request({
    method: "PUT",
    path: `/-/org/${encodeURIComponent(org)}/team`,
    body,
    schema: VoidSchema,
  });
}

/**
 * Delete a team.
 *
 * `DELETE /-/org/{orgName}/{teamName}`
 */
export async function deleteTeam(
  params: { org: string; team: string },
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "DELETE",
    path: `/-/org/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}`,
    schema: VoidSchema,
  });
}

/**
 * Get all users in a team.
 *
 * `GET /-/org/{orgName}/{teamName}/user`
 */
export async function getTeamMembership(
  params: { org: string; team: string },
  client?: NpmClient | null,
): Promise<Result<TeamUsers>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: `/-/org/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/user`,
    schema: TeamUsersSchema,
  });
}

/**
 * Add a user to a team.
 *
 * `PUT /-/org/{orgName}/{teamName}/user`
 */
export async function createTeamMembership(
  params: { org: string; team: string },
  input: TeamMemberInput,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  const body = TeamMemberInputSchema.parse(input);
  return c.request({
    method: "PUT",
    path: `/-/org/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/user`,
    body,
    schema: VoidSchema,
  });
}

/**
 * Remove a user from a team.
 *
 * `DELETE /-/org/{orgName}/{teamName}/user`
 */
export async function deleteTeamMembership(
  params: { org: string; team: string },
  input: TeamMemberInput,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  const body = TeamMemberInputSchema.parse(input);
  return c.request({
    method: "DELETE",
    path: `/-/org/${encodeURIComponent(params.org)}/${encodeURIComponent(params.team)}/user`,
    body,
    schema: VoidSchema,
  });
}
