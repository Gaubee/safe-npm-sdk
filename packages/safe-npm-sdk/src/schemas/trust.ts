import { z } from "zod";

const TrustPermissionSchema = z.enum(["createPackage", "createStagedPackage"]);
export type TrustPermission = z.infer<typeof TrustPermissionSchema>;

// ---------------------------------------------------------------------------
// GitHub Actions trusted publisher
// ---------------------------------------------------------------------------
const GitHubClaimsSchema = z
  .object({
    repository: z.string(),
    workflow_ref: z
      .union([z.string(), z.object({ file: z.string().optional() }).passthrough()])
      .optional(),
    environment: z.string().optional(),
  })
  .passthrough();

export const GitHubActionsConfigSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("github"),
  claims: GitHubClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type GitHubActionsConfig = z.infer<typeof GitHubActionsConfigSchema>;

export const GitHubActionsConfigCreateSchema = z.object({
  type: z.literal("github"),
  claims: GitHubClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type GitHubActionsConfigCreate = z.infer<typeof GitHubActionsConfigCreateSchema>;

// ---------------------------------------------------------------------------
// GitLab Pipelines trusted publisher
// ---------------------------------------------------------------------------
const GitLabClaimsSchema = z
  .object({
    project_path: z.string(),
    ci_config_ref_uri: z
      .union([z.string(), z.object({ file: z.string().optional() }).passthrough()])
      .optional(),
    environment: z.string().optional(),
  })
  .passthrough();

export const GitLabPipelinesConfigSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("gitlab"),
  claims: GitLabClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type GitLabPipelinesConfig = z.infer<typeof GitLabPipelinesConfigSchema>;

export const GitLabPipelinesConfigCreateSchema = z.object({
  type: z.literal("gitlab"),
  claims: GitLabClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type GitLabPipelinesConfigCreate = z.infer<typeof GitLabPipelinesConfigCreateSchema>;

// ---------------------------------------------------------------------------
// CircleCI trusted publisher
// ---------------------------------------------------------------------------
const CircleCIClaimsSchema = z
  .object({
    "oidc.circleci.com/org-id": z.string().uuid(),
    "oidc.circleci.com/project-id": z.string().uuid(),
    "oidc.circleci.com/pipeline-definition-id": z.string().uuid(),
    "oidc.circleci.com/context-ids": z.array(z.string().uuid()).optional(),
    "oidc.circleci.com/vcs-origin": z.string(),
  })
  .passthrough();

export const CircleCIConfigSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("circleci"),
  claims: CircleCIClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type CircleCIConfig = z.infer<typeof CircleCIConfigSchema>;

export const CircleCIConfigCreateSchema = z.object({
  type: z.literal("circleci"),
  claims: CircleCIClaimsSchema,
  permissions: z.array(TrustPermissionSchema),
});
export type CircleCIConfigCreate = z.infer<typeof CircleCIConfigCreateSchema>;

// ---------------------------------------------------------------------------
// Discriminated unions
// ---------------------------------------------------------------------------
/** A trusted publisher configuration (read form, includes id). */
export const TrustedPublisherConfigSchema = z.discriminatedUnion("type", [
  GitHubActionsConfigSchema,
  GitLabPipelinesConfigSchema,
  CircleCIConfigSchema,
]);
export type TrustedPublisherConfig = z.infer<typeof TrustedPublisherConfigSchema>;

/** Input for creating a trusted publisher configuration (no id). */
export const TrustedPublisherConfigCreateSchema = z.discriminatedUnion("type", [
  GitHubActionsConfigCreateSchema,
  GitLabPipelinesConfigCreateSchema,
  CircleCIConfigCreateSchema,
]);
export type TrustedPublisherConfigCreate = z.infer<typeof TrustedPublisherConfigCreateSchema>;

/** The list of trusted publishers for a package. */
export const TrustedPublisherConfigsSchema = z.array(TrustedPublisherConfigSchema);
export type TrustedPublisherConfigs = z.infer<typeof TrustedPublisherConfigsSchema>;
