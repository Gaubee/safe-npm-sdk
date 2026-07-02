import { type NpmClient, resolveClient } from "../client";
import { NpmApiError } from "../error";
import { err, ok, type Result } from "../result";
import { z } from "zod";
import {
  CouchLoginResultSchema,
  type CouchLoginResult,
  WebLoginInitSchema,
} from "../schemas/profile";
import type { OtpOptions } from "./tokens";

export type { OtpOptions };

/** Canonical npm registry host that `doneUrl` is rewritten away from. */
const CANONICAL_REGISTRY_HOST = "registry.npmjs.org";

/**
 * Log in with a username + password (the "couch" flow). Faithful port of
 * npm-profile's `loginCouch`:
 *
 * 1. `PUT /-/user/org.couchdb.user:{username}` with a fresh user document,
 *    **anonymously** (login is how you obtain a token — none is assumed).
 * 2. On `409` (the user already exists): `GET …?write=true` to read the current
 *    document `_rev`, merge it into the body, then `PUT …/-rev/{_rev}` using
 *    HTTP Basic auth (`username:password`) so the registry accepts the update.
 * 3. On `400`: the user does not exist — surface npm-profile's message.
 *
 * The result carries the session `token` on success.
 */
export async function loginCouch(
  username: string,
  password: string,
  opts: OtpOptions = {},
  client?: NpmClient | null,
): Promise<Result<CouchLoginResult>> {
  const c = resolveClient(client);
  const userDocPath = `/-/user/org.couchdb.user:${encodeURIComponent(username)}`;
  const extra = opts.command ? { "npm-command": opts.command } : {};

  const body = {
    _id: `org.couchdb.user:${username}`,
    name: username,
    password,
    type: "user",
    roles: [] as string[],
    date: new Date().toISOString(),
  };

  // Step 1: anonymous PUT of a fresh user document.
  // OTP must be sent here too: for an account with 2FA enabled, the registry
  // requires a one-time password for the session-token write on this PUT (not
  // just the conflict re-PUT in step 3). npm-profile forwards `opts` (incl.
  // otp) on this first PUT; mirroring that avoids an EOTP here that would
  // otherwise abort login for 2FA accounts.
  const firstPut = await c.request({
    method: "PUT",
    path: userDocPath,
    body,
    schema: CouchLoginResultSchema,
    ...(opts.otp !== undefined ? { otp: opts.otp } : {}),
    extraHeaders: extra,
  });
  if (firstPut.ok) {
    // Tag the result with the username, mirroring npm-profile's putCouch().
    return ok(
      { ...firstPut.data, username } as CouchLoginResult,
      firstPut.response as unknown as Result<CouchLoginResult>["response"],
    );
  }

  // Only E409 (user exists) is recoverable; everything else (incl. E400) fails.
  if (firstPut.error.code !== "E409") {
    if (firstPut.error.code === "E400") {
      // npm-profile message parity.
      return err(
        new NpmApiError({
          status: firstPut.error.status,
          message: `There is no user with the username "${username}".`,
          body: firstPut.error.body,
          headers: firstPut.error.headers,
          code: "E400",
          request: { method: "PUT", path: userDocPath },
        }),
        firstPut.response as unknown as Result<CouchLoginResult>["response"],
      );
    }
    return firstPut as Result<CouchLoginResult>;
  }

  // Step 2: conflict — read the existing document to get its _rev.
  const getRes = await c.request({
    method: "GET",
    path: userDocPath,
    query: { write: "true" },
    // Permissive: we only need _rev (and to preserve fields), not strict shape.
    schema: z.record(z.string(), z.unknown()),
    extraHeaders: extra,
  });
  if (!getRes.ok) return getRes as Result<CouchLoginResult>;

  const existing = getRes.data as Record<string, unknown>;
  // Merge: keep the server's value for any field our body doesn't set (except
  // roles, which npm-profile resets). Mirrors npm-profile's merge loop.
  const merged: Record<string, unknown> = { ...existing, ...body };
  for (const key of Object.keys(existing)) {
    if (!(key in body) || key === "roles") {
      merged[key] = existing[key];
    }
  }
  const rev = existing._rev;
  if (typeof rev !== "string") {
    return err(
      new NpmApiError({
        status: getRes.response.status,
        message: "user document has no _rev to authorize the re-PUT",
        body: existing,
        headers: getRes.response.headers,
        request: { method: "GET", path: userDocPath },
      }),
      getRes.response as unknown as Result<CouchLoginResult>["response"],
    );
  }

  // Step 3: re-PUT at the current revision with Basic auth (username:password).
  const revPut = await c.request({
    method: "PUT",
    path: `${userDocPath}/-rev/${encodeURIComponent(rev)}`,
    body: merged,
    schema: CouchLoginResultSchema,
    basic: { username, password },
    ...(opts.otp !== undefined ? { otp: opts.otp } : {}),
    extraHeaders: extra,
  });
  if (!revPut.ok) return revPut as Result<CouchLoginResult>;

  return ok(
    { ...revPut.data, username } as CouchLoginResult,
    revPut.response as unknown as Result<CouchLoginResult>["response"],
  );
}

/**
 * A handle returned by {@link loginWeb}. The caller opens {@link loginUrl} in a
 * browser (the SDK never does); the SDK polls {@link doneUrl} via {@link done}.
 */
export interface WebLoginHandle {
  /** URL the user must visit in a browser to authenticate. */
  loginUrl: string;
  /** URL the SDK polls for completion. */
  doneUrl: string;
  /**
   * Poll for the login to complete. Resolves with the session token once the
   * user finishes browser authentication.
   *
   * - HTTP `200` with a `token` → resolve.
   * - HTTP `202` → still pending; wait `Retry-After` (seconds) or
   *   `intervalMs`, then poll again.
   * - any other status → `err`.
   * - elapsed `timeoutMs` (or `signal` aborted) → `err(timeout)`.
   *
   * The SDK performs the polling only; it never opens a browser.
   */
  done(options?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<Result<{ token: string }>>;
}

/**
 * Initiate a web (browser) login flow.
 *
 * `POST /-/v1/login` (anonymous) → `{ loginUrl, doneUrl }`. Returns a
 * {@link WebLoginHandle}; the caller opens `loginUrl` in a browser and then
 * awaits `handle.done()`.
 *
 * When `rewriteRegistryHost` is not `false`, the canonical `registry.npmjs.org`
 * host in `doneUrl` is rewritten to the configured registry origin (preserving
 * the path prefix), so polling works through a proxy/mirror — exactly like
 * npm-profile's `replaceDoneUrlOrigin`.
 */
export async function loginWeb(
  opts: { rewriteRegistryHost?: boolean } = {},
  client?: NpmClient | null,
): Promise<Result<WebLoginHandle>> {
  const c = resolveClient(client);
  const init = await c.request({
    method: "POST",
    path: "/-/v1/login",
    body: {},
    schema: WebLoginInitSchema,
  });
  if (!init.ok) return init as Result<WebLoginHandle>;

  const { loginUrl, doneUrl } = init.data;
  const finalDoneUrl =
    opts.rewriteRegistryHost === false ? doneUrl : replaceDoneUrlOrigin(doneUrl, c.registry);

  return ok(
    {
      loginUrl,
      doneUrl: finalDoneUrl,
      done: (pollOpts = {}) =>
        pollDone(c, finalDoneUrl, {
          intervalMs: pollOpts.intervalMs ?? 2000,
          timeoutMs: pollOpts.timeoutMs ?? 300_000,
          signal: pollOpts.signal,
        }),
    },
    init.response as unknown as Result<WebLoginHandle>["response"],
  );
}

// --- helpers ---------------------------------------------------------------

/**
 * Poll `doneUrl` until the web login completes. Ported from npm-profile's
 * `webAuthCheckLogin`: 200 + token → done; 202 → wait & retry; else error.
 *
 * The request engine treats 2xx as success (so a 202 with an empty body is a
 * "pending" success) and only returns `err` on 4xx/5xx. We therefore branch on
 * the response status: `200` + token resolves, `202` (or any 2xx without a
 * token) keeps polling, and any error short-circuits.
 */
async function pollDone(
  client: NpmClient,
  doneUrl: string,
  opts: { intervalMs: number; timeoutMs: number; signal?: AbortSignal | undefined },
): Promise<Result<{ token: string }>> {
  const started = Date.now();
  let parsed: URL;
  try {
    parsed = new URL(doneUrl);
  } catch {
    return err(
      new NpmApiError({
        status: 0,
        message: `web login doneUrl is not a valid URL: ${doneUrl}`,
        body: undefined,
        headers: new Headers(),
      }),
      { status: 0, headers: new Headers(), body: undefined } as unknown as Result<{
        token: string;
      }>["response"],
    );
  }
  const path = `${parsed.pathname}${parsed.search}`;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    opts.signal?.throwIfAborted();
    if (Date.now() - started >= opts.timeoutMs) {
      return err(
        new NpmApiError({
          status: 0,
          message: `web login timed out after ${opts.timeoutMs}ms`,
          body: undefined,
          headers: new Headers(),
        }),
        { status: 0, headers: new Headers(), body: undefined } as unknown as Result<{
          token: string;
        }>["response"],
      );
    }

    const res = await client.request({
      method: "GET",
      // 202 returns an empty/non-token body; keep the schema permissive and
      // inspect the parsed data + status ourselves.
      path,
      schema: z.union([z.object({ token: z.string() }), z.unknown()]),
    });

    if (!res.ok) {
      // A genuine 4xx/5xx aborts polling (the request engine already retried 5xx).
      return res as Result<{ token: string }>;
    }

    if (res.response.status === 200) {
      const data = res.data as { token?: string };
      if (typeof data?.token === "string") {
        return ok(
          { token: data.token },
          res.response as unknown as Result<{ token: string }>["response"],
        );
      }
    }

    // 202 / pending: honor Retry-After (seconds) if present, else the interval.
    const retryAfter = res.response.headers.get("retry-after");
    const retryMs = retryAfter !== null ? Number(retryAfter) * 1000 : opts.intervalMs;
    await delay(Number.isFinite(retryMs) ? retryMs : opts.intervalMs);
  }
}

/**
 * Rewrite the canonical `registry.npmjs.org` host in `doneUrl` to the
 * configured registry origin, preserving path prefix + query string. A non-
 * canonical host is left untouched. Port of npm-profile's
 * `replaceDoneUrlOrigin`, for proxy/mirror support.
 */
export function replaceDoneUrlOrigin(doneUrl: string, registry: string): string {
  if (!registry) return doneUrl;
  let done: URL;
  let reg: URL;
  try {
    done = new URL(doneUrl);
    reg = new URL(registry);
  } catch {
    return doneUrl;
  }
  if (done.hostname !== CANONICAL_REGISTRY_HOST) return doneUrl;
  done.protocol = reg.protocol;
  done.host = reg.host;
  const prefix = reg.pathname.replace(/\/$/, "");
  if (
    prefix &&
    prefix !== "/" &&
    done.pathname !== prefix &&
    !done.pathname.startsWith(prefix + "/")
  ) {
    done.pathname = prefix + done.pathname;
  }
  return done.href;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
