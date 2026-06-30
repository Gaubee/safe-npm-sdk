import { z } from "zod";

/** A token permission entry. */
export const TokenPermissionSchema = z.object({
  name: z.string(),
  action: z.string(),
});
export type TokenPermission = z.infer<typeof TokenPermissionSchema>;

/** A token scope entry. */
export const TokenScopeSchema = z.object({
  type: z.string(),
  name: z.string(),
});
export type TokenScope = z.infer<typeof TokenScopeSchema>;

/** A single token object (as returned by list/get). */
export const TokenSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  token: z.string().optional(),
  expiry: z.string().optional(),
  readonly: z.boolean().optional(),
  bypass_2fa: z.boolean().optional(),
  cidr: z.array(z.string()).nullable().optional(),
  revoked: z.string().nullable().optional(),
  created: z.string().optional(),
  updated: z.string().nullable().optional(),
  accessed: z.string().nullable().optional(),
  permissions: z.array(TokenPermissionSchema).optional(),
  scopes: z.array(TokenScopeSchema).optional(),
});
export type Token = z.infer<typeof TokenSchema>;

/** Paginated list of tokens. */
export const TokenListSchema = z.object({
  objects: z.array(TokenSchema),
  total: z.coerce.number().optional(),
  urls: z.record(z.string(), z.string()).optional(),
});
export type TokenList = z.infer<typeof TokenListSchema>;

/** Input for creating a token. */
export const CreateTokenInputSchema = z.object({
  password: z.string(),
  name: z.string(),
  token_description: z.string().optional(),
  expires: z.union([z.number(), z.string()]).optional(),
  bypass_2fa: z.boolean().optional(),
  cidr: z.array(z.string()).optional(),
  packages: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  orgs: z.array(z.string()).optional(),
  packages_and_scopes_permission: z.enum(["read-only", "read-write", "no-access"]).optional(),
  orgs_permission: z.enum(["read-only", "read-write", "no-access"]).optional(),
  readonly: z.boolean().optional(),
});
export type CreateTokenInput = z.infer<typeof CreateTokenInputSchema>;
