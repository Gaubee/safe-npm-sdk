import type { ZodType } from "zod";
import {
  NpmApiError,
  NpmApiErrorAuthIPAddress,
  NpmApiErrorAuthOTP,
  NpmApiErrorAuthUnknown,
  NpmApiErrorGeneral,
} from "./error";
import { type Result, err, ok } from "./result";

/** Authentication credentials. Omit for an anonymous client (no auth header). */
export type Auth = { readonly token: string } | { readonly oidcIdToken: string };

/** Options for constructing a client. */
export interface ClientOptions {
  /** Authentication credentials. Omit for an anonymous client (e.g. public search). */
  auth?: Auth;
  /** Base registry URL. Defaults to the public npm registry. */
  registry?: string;
  /** Custom fetch implementation (testing, Deno, etc.). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Request timeout in ms. Defaults to 30000. */
  timeout?: number;
  /** Max retries on 5xx / network errors. Defaults to 3. */
  retries?: number;
  /** Callback invoked for every `npm-notice` response header value. */
  onNotice?: (notice: string) => void;
}

/** Internal request description consumed by the request engine. */
export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Already-encoded path beginning with `/`. */
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Zod schema used to validate the parsed JSON response body. */
  schema: ZodType<unknown>;
  /** OTP for 2FA. A string is sent as the `npm-otp` header; `null`/`undefined` are not. */
  otp?: string | null | undefined;
  /** Extra npm headers (npm-auth-type, npm-command, ...). */
  extraHeaders?: Record<string, string>;
  /**
   * Per-request HTTP Basic-auth override (mirrors npm-registry-fetch's
   * `forceAuth.username`/`password`). When set, it takes precedence over the
   * client's bearer token and builds `Authorization: Basic <base64(user:pass)>`.
   * Used by couch login's `-rev` re-PUT.
   */
  basic?: { username: string; password: string };
}

/** An npm registry client (optionally anonymous). */
export interface NpmClient {
  readonly registry: string;
  readonly auth: Auth | undefined;
  readonly timeout: number;
  readonly retries: number;
  /** Low-level request engine used by all operations. */
  request: <T>(opts: RequestOptions & { schema: ZodType<T> }) => Promise<Result<T>>;
}

const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 3;

/** Create an npm registry client. */
export function createClient(options: ClientOptions): NpmClient {
  const registry = (options.registry ?? DEFAULT_REGISTRY).replace(/\/+$/, "");
  const auth = options.auth;
  const fetchImpl = options.fetch ?? fetch;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const onNotice = options.onNotice;

  const client: NpmClient = {
    registry,
    auth,
    timeout,
    retries,
    request: async <T>(opts: RequestOptions & { schema: ZodType<T> }): Promise<Result<T>> => {
      const result = await doRequest(client, fetchImpl, onNotice, opts);
      return result as Result<T>;
    },
  };
  return client;
}

// ---------------------------------------------------------------------------
// Request engine
// ---------------------------------------------------------------------------

function buildUrl(registry: string, path: string, query?: RequestOptions["query"]): URL {
  // Resolve the registry against a base URL. Absolute registries
  // (e.g. "https://registry.npmjs.org") parse standalone; relative ones
  // (e.g. "/api" for a same-origin proxy in the browser) need a base. In a
  // browser we use document.baseURI; elsewhere (Node/Deno/Bun) a relative
  // registry has no meaningful base and is treated as an absolute URL.
  // `globalThis.document` keeps the SDK free of a DOM lib dependency while
  // still detecting the browser at runtime.
  const doc = (globalThis as { document?: { baseURI?: string } }).document;
  const base = doc?.baseURI;
  const url = base ? new URL(`${registry}${path}`, base) : new URL(`${registry}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function authToken(auth: Auth | undefined): string | undefined {
  if (!auth) return undefined;
  return "token" in auth ? auth.token : auth.oidcIdToken;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Keys whose values must never appear in logs (credentials / secrets).
// Substrings that mark a key as sensitive, matched case-insensitively and
// treating `-`/`_` as equivalent (e.g. npm-otp, npm_otp, access_token).
const SENSITIVE_KEY_PARTS = ["authorization", "password", "token", "otp", "secret", "apikey"];

function isSensitiveKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => norm.includes(part.replace(/[_-]/g, "")));
}

/** Replace a value with "***" if its key is sensitive. */
function redactValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) return "***";
  // Large base64 attachment blobs (publish) are noise + potentially sensitive.
  if (typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return `<${value.length} chars>`;
  }
  return value;
}

/** Recursively redact sensitive keys within an object, for logging only. */
function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactForLog(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, redactForLog(v));
    }
    return out;
  }
  return value;
}

/**
 * Build a compact, redacted description of a request for error messages.
 * Shows method + URL (with redacted query) + auth/otp presence + redacted body,
 * so failures are debuggable without leaking tokens, passwords, or OTPs.
 * `auth` and `otp` are reported only as present/absent (never their values).
 */
function describeRequest(
  method: string,
  url: URL,
  body: unknown,
  context?: { hasAuth: boolean; otp: string | null | undefined },
): string {
  const q: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) q[k] = String(redactValue(k, v));
  const qs = Object.keys(q).length ? `?${new URLSearchParams(q).toString()}` : "";
  const parts = [`${method} ${url.origin}${url.pathname}${qs}`];
  if (context) {
    parts.push(`auth=${context.hasAuth ? "yes" : "anonymous"}`);
    parts.push(`otp=${typeof context.otp === "string" ? "yes" : "no"}`);
  }
  if (body !== undefined) {
    try {
      parts.push(`body=${JSON.stringify(redactForLog(body))}`);
    } catch {
      parts.push("body=<unserializable>");
    }
  }
  return parts.join(" ");
}

async function doRequest(
  client: NpmClient,
  fetchImpl: typeof fetch,
  onNotice: ((n: string) => void) | undefined,
  opts: RequestOptions,
): Promise<Result<unknown>> {
  const url = buildUrl(client.registry, opts.path, opts.query);

  // Inject Authorization. A per-request `basic` override (mirrors
  // npm-registry-fetch's forceAuth.username/password) takes precedence over the
  // client's bearer token; otherwise the client token is used when present. An
  // anonymous client with no override skips the header entirely (e.g. login,
  // public search).
  const tok = authToken(client.auth);
  const headers = new Headers({ Accept: "application/json", ...opts.extraHeaders });
  if (opts.basic) {
    headers.set("Authorization", `Basic ${basicBase64(opts.basic.username, opts.basic.password)}`);
  } else if (tok !== undefined) {
    headers.set("Authorization", `Bearer ${tok}`);
  }
  const hasAuth = opts.basic !== undefined || tok !== undefined;
  // OTP: only a real (non-null) string is sent as the npm-otp header.
  if (typeof opts.otp === "string") headers.set("npm-otp", opts.otp);
  const hasBody = opts.body !== undefined;
  if (hasBody) headers.set("Content-Type", "application/json");

  const reqMeta: { method: string; path: string } = { method: opts.method, path: opts.path };

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), client.timeout);
    let res: Response;
    try {
      const init: RequestInit = {
        method: opts.method,
        headers,
        signal: controller.signal,
      };
      if (hasBody) init.body = JSON.stringify(opts.body);
      res = await fetchImpl(url, init);
    } catch (e) {
      clearTimeout(timeoutId);
      // Network error / abort: retry then give up.
      if (attempt < client.retries) {
        attempt += 1;
        await delay(backoffMs(attempt));
        continue;
      }
      const error = new NpmApiError({
        status: 0,
        message: `network error: ${e instanceof Error ? e.message : "unknown"} [${describeRequest(opts.method, url, opts.body, { hasAuth, otp: opts.otp })}]`,
        body: undefined,
        headers: new Headers(),
        request: reqMeta,
      });
      return err(error, { status: 0, headers: new Headers(), body: undefined });
    }
    clearTimeout(timeoutId);

    // Surface npm-notice on every response.
    const notice = res.headers.get("npm-notice");
    if (notice && onNotice) onNotice(notice);

    const body = await parseBody(res);

    if (!res.ok) {
      // Retry server errors.
      if (res.status >= 500 && attempt < client.retries) {
        attempt += 1;
        await delay(backoffMs(attempt));
        continue;
      }
      const error = classifyError({
        status: res.status,
        method: opts.method,
        url: `${url.origin}${url.pathname}`,
        body,
        headers: res.headers,
        request: reqMeta,
        // Append the redacted request description so failures stay debuggable,
        // as the legacy base NpmApiError did.
        suffix: ` [${describeRequest(opts.method, url, opts.body, { hasAuth, otp: opts.otp })}]`,
      });
      return err(error, { status: res.status, headers: res.headers, body });
    }

    // Success: validate with zod schema.
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      const error = new NpmApiError({
        status: res.status,
        message: `response schema validation failed: ${issues} [${describeRequest(opts.method, url, opts.body, { hasAuth, otp: opts.otp })}]`,
        body,
        headers: res.headers,
        request: reqMeta,
      });
      return err(error, { status: res.status, headers: res.headers, body });
    }
    return ok(parsed.data, { status: res.status, headers: res.headers, body: parsed.data });
  }
}

function backoffMs(attempt: number): number {
  // Exponential backoff with jitter: 250ms, 500ms, 1000ms, ... capped at 8s.
  const base = Math.min(250 * 2 ** (attempt - 1), 8_000);
  return base + Math.floor(Math.random() * 100);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pick the right {@link NpmApiError} subclass for a `>= 400` response, porting
 * `npm-registry-fetch/lib/check-response.js#checkErrors`:
 *
 * - 401 + `www-authenticate: otp` (or a body mentioning "one-time pass") →
 *   {@link NpmApiErrorAuthOTP} (`EOTP`).
 * - 401 + `www-authenticate: ipaddress` → {@link NpmApiErrorAuthIPAddress}
 *   (`EAUTHIP`).
 * - 401 + any other `www-authenticate` challenge →
 *   {@link NpmApiErrorAuthUnknown} (`E401`).
 * - everything else → {@link NpmApiErrorGeneral} (`E<status>`).
 *
 * `suffix` is appended to the message (the redacted request description) so the
 * auth-specific subclasses keep the debuggability of the legacy base error.
 */
function classifyError(args: {
  status: number;
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
  request?: { method: string; path: string };
  suffix?: string;
}): NpmApiError {
  const { status, method, url, body, headers, request, suffix = "" } = args;
  const challenge = headers.get("www-authenticate");
  const challengeLower = challenge ? challenge.split(/,\s*/).map((s) => s.toLowerCase()) : [];

  let error: NpmApiError;
  if (status === 401 && challengeLower.includes("otp")) {
    error = new NpmApiErrorAuthOTP({ status, body, headers, request });
  } else if (status === 401 && challengeLower.includes("ipaddress")) {
    error = new NpmApiErrorAuthIPAddress({ status, body, headers, request });
  } else if (status === 401 && challenge) {
    error = new NpmApiErrorAuthUnknown({ status, body, headers, request });
  } else if (status === 401 && typeof body === "string" && /one-time pass/.test(body)) {
    // Heuristic for malformed OTP responses without www-authenticate.
    error = new NpmApiErrorAuthOTP({ status, body, headers, request });
  } else {
    error = new NpmApiErrorGeneral({
      status,
      method,
      url,
      body,
      headers,
      request,
    });
  }
  // The subclasses build npm-registry-fetch-style messages without the redacted
  // request description; append it directly so all errors are equally
  // debuggable without losing the subclass identity.
  if (suffix) (error as Error).message += suffix;
  return error;
}

/**
 * Cross-platform UTF-8-safe Base64 encoder for HTTP Basic auth. Avoids
 * `Buffer`/`btoa` so the SDK stays browser-friendly (consistent with the
 * Web Crypto migration). Encodes each char to its UTF-8 byte sequence, then
 * to Base64 via `btoa` over a binary string.
 */
function basicBase64(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  // UTF-8 encode → binary string → btoa.
  const bytes = new TextEncoder().encode(credentials);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Global default client
// ---------------------------------------------------------------------------

let defaultClient: NpmClient | null = null;

/** Get the global default client, or `null` if none is set. */
export function getDefaultClient(): NpmClient | null {
  return defaultClient;
}

/**
 * Set (or clear) the global default client.
 *
 * When set, operations can be called without passing a client explicitly:
 * `listTokens()` instead of `listTokens(client)`.
 */
export function setDefaultClient(client: NpmClient | null): void {
  defaultClient = client;
}

/**
 * Resolve a client argument. The argument's type encodes what the operation
 * allows, and the runtime honors each case explicitly (this is the SDK's
 * `null`-vs-`undefined` convention — see the contributing docs):
 *
 * - `undefined` (omitted) → use the {@link getDefaultClient global default}.
 *   Throws if none is set.
 * - a client → use it as-is.
 * - `null` → an **anonymous** client (no `Authorization` header, public
 *   registry). Only accepted by operations that permit anonymous access —
 *   those declare `client?: NpmClient | null`, the rest declare
 *   `client?: NpmClient` and reject `null` at the type level.
 *
 * @example
 * ```ts
 * searchPackages({}, null);        // anonymous (public search)
 * listTokens();                    // uses the global default client
 * listTokens(myClient);            // uses the given client
 * ```
 */
// Overload 1: non-nullable — for operations that require authentication.
export function resolveClient(client?: NpmClient): NpmClient;
// Overload 2: nullable — for operations that permit anonymous access.
export function resolveClient(client?: NpmClient | null): NpmClient;
export function resolveClient(client?: NpmClient | null): NpmClient {
  // `null` is an explicit request for an anonymous client (no token).
  if (client === null) return getAnonymousClient();
  const resolved = client ?? defaultClient;
  if (!resolved) {
    throw new Error(
      "No npm client provided. Pass a client to the operation, or set one with setDefaultClient(createClient({...})).",
    );
  }
  return resolved;
}

// A lazily-built anonymous client reused across calls (no auth header, public
// registry, the configured global fetch). Built once and cached.
let anonymousClient: NpmClient | null = null;
function getAnonymousClient(): NpmClient {
  if (!anonymousClient) anonymousClient = createClient({});
  return anonymousClient;
}
