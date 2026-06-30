import type { ApiResponse } from "./result";

/** Options for building npm-specific request headers. */
export interface AuthHeaderOptions {
  /** One-time password for two-factor authentication. */
  otp?: string;
  /** Authentication type. `"web"` enables the browser-based WebAuthn flow. */
  authType?: "web";
  /** Command context, e.g. `"token"` or `"trust"`. */
  command?: string;
}

/**
 * Build npm-specific headers (`npm-otp`, `npm-auth-type`, `npm-command`) from
 * the provided options. Returns an empty object when nothing is set.
 */
export function buildNpmHeaders(opts: AuthHeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (opts.otp !== undefined) headers["npm-otp"] = opts.otp;
  if (opts.authType !== undefined) headers["npm-auth-type"] = opts.authType;
  if (opts.command !== undefined) headers["npm-command"] = opts.command;
  return headers;
}

/** The shape of a WebAuthn challenge returned by npm on certain 401 responses. */
export interface WebAuthnChallenge {
  /** URL to open in a browser for security-key authentication. */
  authUrl: string;
  /** URL to poll for completion of authentication. */
  doneUrl: string;
}

/**
 * Extract a WebAuthn challenge (`authUrl`/`doneUrl`) from a response body, if
 * present. npm returns this in the body of a 401 when 2FA is enabled and the
 * web-auth flow headers were sent.
 *
 * Returns `null` if the body does not match the expected shape.
 */
export function parseWebAuthnChallenge(body: unknown): WebAuthnChallenge | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.authUrl === "string" && typeof b.doneUrl === "string") {
    return { authUrl: b.authUrl, doneUrl: b.doneUrl };
  }
  return null;
}

/**
 * Extract the `npm-notice` header value from a response, if present.
 */
export function getNotice(response: ApiResponse<unknown>): string | null {
  return response.headers.get("npm-notice");
}
