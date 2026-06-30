import { z } from "zod";

/** Response from exchanging an OIDC id_token for an npm registry token. */
export const OidcTokenExchangeResponseSchema = z.object({
  token_type: z.literal("oidc"),
  token: z.string(),
  created: z.string(),
  expires: z.string(),
  scope: z.string().optional(),
});
export type OidcTokenExchangeResponse = z.infer<typeof OidcTokenExchangeResponseSchema>;
