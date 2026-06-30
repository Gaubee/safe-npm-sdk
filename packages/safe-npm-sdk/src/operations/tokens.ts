import { type NpmClient, resolveClient } from "../client";
import type { Result } from "../result";
import { VoidSchema } from "../schemas/common";
import {
  type CreateTokenInput,
  CreateTokenInputSchema,
  type Token,
  type TokenList,
  TokenListSchema,
  TokenSchema,
} from "../schemas/tokens";

/** Options shared by operations that require 2FA. */
export interface OtpOptions {
  /** One-time password for two-factor authentication. */
  otp: string;
  /** Authentication type. `"web"` enables the browser-based WebAuthn flow. */
  authType?: "web";
  /** Command context, e.g. `"token"`. */
  command?: string;
}

/**
 * List npm access tokens for the authenticated user.
 *
 * `GET /-/npm/v1/tokens`
 */
export async function listTokens(client?: NpmClient | null): Promise<Result<TokenList>> {
  const c = resolveClient(client);
  return c.request({
    method: "GET",
    path: "/-/npm/v1/tokens",
    schema: TokenListSchema,
  });
}

/**
 * Create a new npm access token. Requires 2FA (an `otp`).
 *
 * `POST /-/npm/v1/tokens`
 *
 * The full token value is only available in the returned `data.token` — store
 * it securely. A `npm-notice` header is also returned (see `onNotice`).
 */
export async function createToken(
  input: CreateTokenInput,
  opts: OtpOptions,
  client?: NpmClient | null,
): Promise<Result<Token>> {
  const c = resolveClient(client);
  const body = CreateTokenInputSchema.parse(input);
  return c.request({
    method: "POST",
    path: "/-/npm/v1/tokens",
    body,
    schema: TokenSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Delete an npm access token by its value (or id). Requires 2FA (an `otp`).
 *
 * `DELETE /-/npm/v1/tokens/token/{token}`
 */
export async function deleteToken(
  token: string,
  opts: OtpOptions,
  client?: NpmClient | null,
): Promise<Result<unknown>> {
  const c = resolveClient(client);
  return c.request({
    method: "DELETE",
    path: `/-/npm/v1/tokens/token/${encodeURIComponent(token)}`,
    schema: VoidSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}
