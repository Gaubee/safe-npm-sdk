import { type NpmClient, resolveClient } from "../client";
import { NpmApiError } from "../error";
import { err, ok, type Result } from "../result";
import type { OtpOptions } from "./tokens";
import {
  ProfileSchema,
  type Profile,
  type ProfileUpdate,
  tfaIsOtpauth,
  tfaIsRecoveryCodes,
} from "../schemas/profile";

export type { OtpOptions };

/**
 * Get the authenticated user's profile.
 *
 * `GET /-/npm/v1/user`
 *
 * @see https://github.com/npm/registry/blob/main/docs/user/profile.md
 */
export async function getProfile(client?: NpmClient): Promise<Result<Profile>> {
  const c = resolveClient(client);
  return c.request({ method: "GET", path: "/-/npm/v1/user", schema: ProfileSchema });
}

/**
 * Update the authenticated user's profile. Requires 2FA (an `otp`).
 *
 * `POST /-/npm/v1/user`
 *
 * Empty-string values are coerced to `null` (npm-profile parity: profile keys
 * can't be empty strings, but they can be `null` to clear a field).
 *
 * @see https://github.com/npm/registry/blob/main/docs/user/profile.md
 */
export async function updateProfile(
  changes: ProfileUpdate,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<Profile>> {
  const c = resolveClient(client);
  // npm-profile coerces '' → null: profile keys can't be empty strings, but
  // they CAN be null (to clear a value).
  const body = coerceEmptyToNull(changes);
  return c.request({
    method: "POST",
    path: "/-/npm/v1/user",
    body,
    schema: ProfileSchema,
    otp: opts.otp,
    extraHeaders: {
      ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
      ...(opts.command ? { "npm-command": opts.command } : {}),
    },
  });
}

/**
 * Change the authenticated user's password. Requires 2FA (an `otp`). Changing
 * the password sends the user an email and does NOT invalidate existing tokens.
 *
 * Thin wrapper over {@link updateProfile} sending `{ password: { old, new } }`.
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<Profile>> {
  return updateProfile({ password: { old: oldPassword, new: newPassword } }, opts, client);
}

/**
 * Options for {@link enableTwoFactor}.
 */
export interface EnableTwoFactorOptions {
  /** Desired 2FA strength. */
  mode: "auth-only" | "auth-and-writes";
  /** The current account password, required by the registry to enable 2FA. */
  password: string;
  /**
   * Called once the registry returns the `otpauth://` URL. The caller should
   * render it as a QR code, let the user scan it with their authenticator app,
   * and resolve with the one-time code they enter. Resolve with `null` to
   * abort the flow (2FA will NOT be enabled). The SDK never renders a QR or
   * opens anything — this keeps it browser/UI-agnostic.
   */
  promptForCode: (otpauthUrl: string) => Promise<string | null>;
}

/**
 * Enable two-factor authentication via the documented two-step flow.
 *
 * 1. `POST { tfa: { mode, password } }` → the registry returns a Profile whose
 *    `tfa` is an `otpauth://` URL.
 * 2. The caller renders that URL as a QR code (via `promptForCode`) and returns
 *    a one-time code.
 * 3. `POST { tfa: [code] }` → the registry finalizes setup and returns a
 *    Profile whose `tfa` is an array of single-use recovery codes.
 *
 * Returns the recovery codes; the caller MUST persist them securely. If
 * `promptForCode` resolves `null` (user aborted), returns an `err` without
 * sending the confirmation code, leaving 2FA unconfigured. Requires 2FA (an
 * `otp`) for the underlying updates.
 *
 * @see https://github.com/npm/registry/blob/main/docs/user/profile.md#two-factor-authentication-flow
 */
export async function enableTwoFactor(
  options: EnableTwoFactorOptions,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<{ recoveryCodes: string[] }>> {
  const c = resolveClient(client);
  const extra = {
    ...(opts.authType ? { "npm-auth-type": opts.authType } : {}),
    ...(opts.command ? { "npm-command": opts.command } : {}),
  };

  // Step 1: request the mode + password. The registry returns an otpauth URL.
  const startRes = await c.request({
    method: "POST",
    path: "/-/npm/v1/user",
    body: { tfa: { mode: options.mode, password: options.password } },
    schema: ProfileSchema,
    otp: opts.otp,
    extraHeaders: extra,
  });
  if (!startRes.ok) return startRes as unknown as Result<{ recoveryCodes: string[] }>;

  const tfa = startRes.data.tfa ?? null;
  if (!tfaIsOtpauth(tfa)) {
    // The registry didn't return an otpauth URL — either 2FA was already on,
    // or the response shape was unexpected. Surface it as an error.
    return err(
      new NpmApiError({
        status: startRes.response.status,
        message: `expected an otpauth:// URL to begin 2FA setup, got ${JSON.stringify(tfa)}`,
        body: startRes.data,
        headers: startRes.response.headers,
        request: { method: "POST", path: "/-/npm/v1/user" },
      }),
      startRes.response as unknown as Result<{ recoveryCodes: string[] }>["response"],
    );
  }

  // Step 2: caller renders the QR and returns a one-time code (or aborts).
  const code = await options.promptForCode(tfa);
  if (code === null) {
    return err(
      new NpmApiError({
        status: startRes.response.status,
        message: "2FA setup aborted: no one-time code provided",
        body: startRes.data,
        headers: startRes.response.headers,
        request: { method: "POST", path: "/-/npm/v1/user" },
      }),
      startRes.response as unknown as Result<{ recoveryCodes: string[] }>["response"],
    );
  }

  // Step 3: submit the code to finalize. The registry returns recovery codes.
  const confirmRes = await c.request({
    method: "POST",
    path: "/-/npm/v1/user",
    body: { tfa: [code] },
    schema: ProfileSchema,
    otp: opts.otp,
    extraHeaders: extra,
  });
  if (!confirmRes.ok) return confirmRes as unknown as Result<{ recoveryCodes: string[] }>;

  const codes = confirmRes.data.tfa ?? null;
  if (!tfaIsRecoveryCodes(codes)) {
    return err(
      new NpmApiError({
        status: confirmRes.response.status,
        message: `expected recovery codes after 2FA setup, got ${JSON.stringify(codes)}`,
        body: confirmRes.data,
        headers: confirmRes.response.headers,
        request: { method: "POST", path: "/-/npm/v1/user" },
      }),
      confirmRes.response as unknown as Result<{ recoveryCodes: string[] }>["response"],
    );
  }

  return ok(
    { recoveryCodes: codes },
    confirmRes.response as unknown as Result<{ recoveryCodes: string[] }>["response"],
  );
}

/**
 * Disable two-factor authentication. Requires the current `password`. Requires
 * 2FA (an `otp`) for the underlying update.
 */
export async function disableTwoFactor(
  password: string,
  opts: OtpOptions,
  client?: NpmClient,
): Promise<Result<Profile>> {
  return updateProfile({ tfa: { mode: "disable", password } }, opts, client);
}

// --- helpers ---------------------------------------------------------------

/**
 * Recursively coerce empty-string leaf values to `null` (npm-profile parity),
 * without touching objects or arrays. Mirrors npm-profile's
 * `Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v === '' ? null : v]))`
 * but applied to nested objects too (e.g. `password`).
 */
function coerceEmptyToNull(value: unknown): unknown {
  if (value === "") return null;
  if (Array.isArray(value)) return value.map(coerceEmptyToNull);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = coerceEmptyToNull(v);
    }
    return out;
  }
  return value;
}
