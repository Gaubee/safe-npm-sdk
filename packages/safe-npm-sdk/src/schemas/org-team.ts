import { z } from "zod";

/** Org members map: username -> role. */
export const OrgMembersSchema = z.record(z.string(), z.string());
export type OrgMembers = z.infer<typeof OrgMembersSchema>;

/** Org invite/membership confirmation. */
export const OrgInviteSchema = z
  .object({
    org: z
      .object({
        name: z.string().optional(),
        size: z.string().optional(),
      })
      .passthrough()
      .optional(),
    user: z.string().optional(),
    role: z.string().optional(),
  })
  .passthrough();
export type OrgInvite = z.infer<typeof OrgInviteSchema>;

/** Teams in an org: array of "orgname:teamname". */
export const OrgTeamsSchema = z.array(z.string());
export type OrgTeams = z.infer<typeof OrgTeamsSchema>;

/** Users in a team: array of usernames. */
export const TeamUsersSchema = z.array(z.string());
export type TeamUsers = z.infer<typeof TeamUsersSchema>;

/** Input for creating a team. */
export const CreateTeamInputSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;

/** Input for changing org membership. */
export const ChangeOrgMembershipInputSchema = z.object({
  user: z.string(),
  role: z.enum(["developer", "admin", "owner"]).optional(),
});
export type ChangeOrgMembershipInput = z.infer<typeof ChangeOrgMembershipInputSchema>;

/** Input for adding/removing a team member. */
export const TeamMemberInputSchema = z.object({
  user: z.string(),
});
export type TeamMemberInput = z.infer<typeof TeamMemberInputSchema>;

/** Input for removing an org member. */
export const RemoveOrgMemberInputSchema = z.object({
  user: z.string(),
});
export type RemoveOrgMemberInput = z.infer<typeof RemoveOrgMemberInputSchema>;
