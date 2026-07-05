import { type NpmClient, resolveClient } from "../client";
import { NpmApiError } from "../error";
import { err, ok, type Result } from "../result";
import { z } from "zod";
import {
  ProfileSchema,
  type Profile,
  type ProfileUpdate,
  tfaIsOtpauth,
  tfaIsRecoveryCodes,
} from "../schemas/profile";
import { searchPackages } from "./search";
import type { OtpOptions } from "./tokens";

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

// ---------------------------------------------------------------------------
// Avatar lookup
// ---------------------------------------------------------------------------

/**
 * Which link of the {@link lookupAvatar} fallback chain produced the avatar.
 *
 * - `"authenticated-profile"` — derived from the authenticated user's own
 *   profile (their `email` → Gravatar).
 * - `"registry-profile"` — read from a registry user document
 *   (`/-/user/{name}` or `/-/user/org.couchdb.user:{name}`).
 * - `"maintainer-gravatar"` — discovered via a registry maintainer search and
 *   verified against Gravatar.
 * - `"none"` — no avatar could be resolved from any source.
 */
export type AvatarSource =
  | "authenticated-profile"
  | "registry-profile"
  | "maintainer-gravatar"
  | "none";

/**
 * The result of {@link lookupAvatar}. `source` tells the caller which fallback
 * link produced `avatarUrl`, so they can decide how much to trust it (an
 * authenticated-profile avatar is stronger signal than a maintainer search
 * hit). When `source === "none"`, `avatarUrl` is `null`.
 */
export interface AvatarLookup {
  username: string;
  registry: string;
  avatarUrl: string | null;
  source: AvatarSource;
}

/**
 * Resolve a user's avatar URL, trying several sources in order of reliability.
 *
 * NPM no longer exposes a reliable anonymous avatar endpoint, so this walks a
 * fallback chain (ported from `pnpm-pub`'s `lookupNpmProfileIdentity`) and
 * returns the first hit along with a {@link AvatarSource} tag:
 *
 * 1. **authenticated profile** — only when `client` carries a token. Reads the
 *    profile's `email` and verifies a Gravatar URL for it.
 * 2. **registry user document** — `GET /-/user/{name}` and the
 *    `org.couchdb.user:`-prefixed form; reads an `avatar`/`avatarUrl`/
 *    `avatar_url` field if present.
 * 3. **maintainer search** — searches packages published/maintained by the
 *    user, reads a matching publisher/maintainer `email`, verifies Gravatar.
 *
 * Avatar resolution is best-effort: every failing link silently falls through
 * to the next, and a total miss returns `ok({ avatarUrl: null, source: "none" })`
 * rather than an error. Only an unresolvable client (none passed, no default
 * set) yields `err`.
 *
 * @example
 * ```ts
 * const r = await lookupAvatar("gaubee");
 * if (r.ok && r.data.avatarUrl) {
 *   console.log(r.data.avatarUrl, "via", r.data.source);
 * }
 * ```
 */
export async function lookupAvatar(
  username: string,
  client?: NpmClient | null,
): Promise<Result<AvatarLookup>> {
  const c = resolveClient(client);
  const normalizedUsername = username.trim();
  const base: AvatarLookup = {
    username: normalizedUsername,
    registry: c.registry,
    avatarUrl: null,
    source: "none",
  };
  if (!normalizedUsername) return ok(base, emptyResponse());

  // Link 1: authenticated profile (only when the client carries a token).
  // `getProfile` requires auth; an anonymous client (null) has auth === undefined.
  if (c.auth) {
    const profileRes = await getProfile(c);
    if (profileRes.ok) {
      const email = profileRes.data.email ?? null;
      if (email) {
        const gravatar = await verifiedGravatarUrl(email);
        if (gravatar) {
          return ok(
            { ...base, avatarUrl: gravatar, source: "authenticated-profile" },
            emptyResponse(),
          );
        }
      }
    }
    // Auth failures (e.g. token revoked) are swallowed — avatars are cosmetic,
    // and the registry-profile / maintainer links still apply.
  }

  // Link 2: registry user document. Try both id shapes; npm uses either.
  const userDocPaths = [
    `/-/user/${encodeURIComponent(normalizedUsername)}`,
    `/-/user/org.couchdb.user:${encodeURIComponent(normalizedUsername)}`,
  ];
  for (const path of userDocPaths) {
    const docRes = await c.request({
      method: "GET",
      path,
      // Permissive: we only read an avatar field, not a strict shape.
      schema: z.record(z.string(), z.unknown()),
    });
    if (docRes.ok) {
      const avatar = readStringField(docRes.data, "avatar", "avatarUrl", "avatar_url");
      const normalized = normalizeAvatarUrl(avatar);
      if (normalized) {
        return ok({ ...base, avatarUrl: normalized, source: "registry-profile" }, emptyResponse());
      }
    }
  }

  // Link 3: maintainer search → matching email → verified Gravatar.
  const email = await lookupMaintainerEmail(normalizedUsername, c);
  if (email) {
    const gravatar = await verifiedGravatarUrl(email);
    if (gravatar) {
      return ok({ ...base, avatarUrl: gravatar, source: "maintainer-gravatar" }, emptyResponse());
    }
  }

  return ok(base, emptyResponse());
}

// --- avatar helpers --------------------------------------------------------

/** An empty {@link ApiResponse}-shaped object, for synthesized success results. */
function emptyResponse<T = unknown>(): import("../result").ApiResponse<T> {
  return { status: 0, headers: new Headers(), body: undefined as unknown as T };
}

/**
 * Read the first non-empty string among `keys` of a record, trimmed. Returns
 * `null` when the value is missing, non-string, or blank.
 */
function readStringField(value: unknown, ...keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string" && field.trim().length > 0) return field.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a registry-supplied avatar value into a usable URL.
 *
 * npm historically emitted `/avatar/{md5}` paths (a Gravatar hash); those are
 * rewritten to a full Gravatar URL. Otherwise an absolute http(s) URL is
 * returned as-is, and anything else resolves to `null`.
 */
function normalizeAvatarUrl(value: string | null): string | null {
  if (!value) return null;
  const npmAvatar = value.match(/(?:https:\/\/www\.npmjs\.com)?\/avatar\/([a-f0-9]{32})/i);
  if (npmAvatar?.[1]) {
    // The legacy npm avatar hash is an MD5 of the email — Gravatar still
    // accepts MD5 hashes, so we can build a valid URL directly from it.
    return `https://gravatar.com/avatar/${npmAvatar[1].toLowerCase()}?s=128&d=404`;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Find a publisher/maintainer email matching `username` via the registry
 * search API. Returns the first matching email, or `null`.
 */
async function lookupMaintainerEmail(username: string, client: NpmClient): Promise<string | null> {
  const res = await searchPackages({ text: `maintainer:${username}`, size: 5 }, client);
  if (!res.ok) return null;
  const lower = username.toLowerCase();
  for (const entry of res.data.objects) {
    const pkg = entry.package;
    const publisherEmail = readMatchingIdentityEmail(pkg.publisher, lower);
    if (publisherEmail) return publisherEmail;
    const maintainers = pkg.maintainers;
    if (!maintainers) continue;
    for (const maintainer of maintainers) {
      const email = readMatchingIdentityEmail(maintainer, lower);
      if (email) return email;
    }
  }
  return null;
}

function readMatchingIdentityEmail(value: unknown, lowerUsername: string): string | null {
  if (!isRecord(value)) return null;
  const username = readStringField(value, "username");
  const email = readStringField(value, "email");
  return username?.toLowerCase() === lowerUsername && email ? email : null;
}

/**
 * Build a Gravatar URL for an email and verify it exists with a HEAD request.
 * Uses SHA-256 (Gravatar's current recommendation; more secure than the legacy
 * MD5) via the Web Crypto API, so no `node:crypto` dependency. Returns `null`
 * when Gravatar responds non-2xx or the request fails — never throws.
 *
 * `?d=404` makes Gravatar answer `404` when no avatar is set, instead of
 * serving a default placeholder image.
 */
async function verifiedGravatarUrl(email: string): Promise<string | null> {
  const url = await gravatarUrlFromEmail(email);
  // NOTE: this uses the global fetch, not the client's injected one — the
  // registry request engine doesn't expose its fetch impl, and Gravatar is a
  // best-effort cosmetic probe that shouldn't acquire SDK-level fetch wiring.
  const fetchImpl = typeof fetch === "function" ? fetch : globalThis.fetch;
  try {
    const res = await fetchImpl(url, { method: "HEAD" });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

/** Build a SHA-256 Gravatar URL for `email` via Web Crypto. */
async function gravatarUrlFromEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `https://gravatar.com/avatar/${hex}?s=128&d=404`;
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
