import { z } from "zod";

/** Package access levels map: packageName -> access level. */
export const PackageAccessLevelsSchema = z.record(z.string(), z.string());
export type PackageAccessLevels = z.infer<typeof PackageAccessLevelsSchema>;

/** Package visibility map: packageName -> "public" | "private". */
export const PackageVisibilityMapSchema = z.record(z.string(), z.string());
export type PackageVisibilityMap = z.infer<typeof PackageVisibilityMapSchema>;

/** User access levels map: username -> access level. */
export const UserAccessLevelsSchema = z.record(z.string(), z.string());
export type UserAccessLevels = z.infer<typeof UserAccessLevelsSchema>;

/** Input for granting a package to a team. */
export const GrantTeamPackageInputSchema = z.object({
  package: z.string(),
  permissions: z.enum(["read-only", "read-write"]),
});
export type GrantTeamPackageInput = z.infer<typeof GrantTeamPackageInputSchema>;

/** Input for setting package access/visibility options. */
export const SetPackageAccessInputSchema = z.object({
  access: z.enum(["public", "private"]).optional(),
  publish_requires_tfa: z.boolean().optional(),
  automation_token_overrides_tfa: z.boolean().optional(),
});
export type SetPackageAccessInput = z.infer<typeof SetPackageAccessInputSchema>;
