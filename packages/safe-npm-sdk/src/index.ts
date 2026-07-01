// Core
export { createClient, getDefaultClient, setDefaultClient, resolveClient } from "./client";
export type { Auth, ClientOptions, NpmClient, RequestOptions } from "./client";
export { NpmApiError } from "./error";
export { ok, err } from "./result";
export type { ApiResponse, Result, OkResult, ErrResult } from "./result";
export { escapePackageName } from "./encode";
export { buildNpmHeaders, parseWebAuthnChallenge, getNotice } from "./headers";
export type { AuthHeaderOptions, WebAuthnChallenge } from "./headers";

// Operations — Tokens
export { listTokens, createToken, deleteToken } from "./operations/tokens";
export type { OtpOptions } from "./operations/tokens";

// Operations — Access
export {
  getTeamPackageGrants,
  createTeamPackageGrant,
  deleteTeamPackageGrant,
  getOrgPackages,
  getPackageCollaborators,
  getPackageVisibility,
  setPackageAccess,
} from "./operations/access";

// Operations — Org & Team
export {
  getOrgMembership,
  changeOrgMembership,
  deleteOrgMembership,
  getScopeTeams,
  createTeam,
  deleteTeam,
  getTeamMembership,
  createTeamMembership,
  deleteTeamMembership,
} from "./operations/org-team";

// Operations — Publish
export { publish } from "./operations/publish";
export type { PublishOptions } from "./operations/publish";

// Operations — Search
export { searchPackages } from "./operations/search";

// Operations — Audit
export { bulkAudit } from "./operations/audit";

// Operations — OIDC
export { exchangeOidcToken } from "./operations/oidc";

// Operations — Trust
export {
  getTrustedPublishers,
  configureTrustedPublisher,
  deleteTrustedPublisher,
} from "./operations/trust";

// Operations — Unpublish (live version removal)
export { unpublishPackage } from "./operations/unpublish";
export type { UnpublishResult } from "./operations/unpublish";

// Operations — Stage
export {
  getStageItems,
  stagePackageVersion,
  getStagePackageVersion,
  deleteStagePackageVersion,
  approveStagePackageVersion,
  getStagePackageTarball,
} from "./operations/stage";

// Schemas (zod) + inferred types
export * from "./schemas/common";
export * from "./schemas/tokens";
export * from "./schemas/access";
export * from "./schemas/org-team";
export * from "./schemas/publish";
export * from "./schemas/search";
export * from "./schemas/audit";
export * from "./schemas/oidc";
export * from "./schemas/trust";
export * from "./schemas/stage";
