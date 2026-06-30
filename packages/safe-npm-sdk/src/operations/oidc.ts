import { type NpmClient, resolveClient } from "../client";
import { escapePackageName } from "../encode";
import type { Result } from "../result";
import { type OidcTokenExchangeResponse, OidcTokenExchangeResponseSchema } from "../schemas/oidc";

/**
 * Exchange an OIDC id_token (from a supported CI/CD provider) for a
 * short-lived, package-scoped npm registry token.
 *
 * `POST /-/npm/v1/oidc/token/exchange/package/{package_name}`
 *
 * The client must be authenticated with an OIDC id_token as the bearer
 * (`createClient({ auth: { oidcIdToken } })`). The id_token's `aud` claim must
 * be `npm:registry.npmjs.org`.
 */
export async function exchangeOidcToken(
  packageName: string,
  client?: NpmClient | null,
): Promise<Result<OidcTokenExchangeResponse>> {
  const c = resolveClient(client);
  return c.request({
    method: "POST",
    path: `/-/npm/v1/oidc/token/exchange/package/${escapePackageName(packageName)}`,
    schema: OidcTokenExchangeResponseSchema,
  });
}
