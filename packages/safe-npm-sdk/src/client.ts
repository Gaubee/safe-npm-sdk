import type { ZodType } from "zod";
import { NpmApiError } from "./error";
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
  otp?: string | null;
  /** Extra npm headers (npm-auth-type, npm-command, ...). */
  extraHeaders?: Record<string, string>;
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

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.length > 0) return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string" && b.message.length > 0) return b.message;
    if (typeof b.error === "string" && b.error.length > 0) return b.error;
  }
  return fallback;
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

  // Inject Authorization only when the client carries credentials. An anonymous
  // client (auth omitted) skips the header entirely (e.g. public search).
  const tok = authToken(client.auth);
  const headers = new Headers({ Accept: "application/json", ...opts.extraHeaders });
  if (tok !== undefined) headers.set("Authorization", `Bearer ${tok}`);
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
        message: `network error: ${e instanceof Error ? e.message : "unknown"} [${describeRequest(opts.method, url, opts.body, { hasAuth: tok !== undefined, otp: opts.otp })}]`,
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
      const error = new NpmApiError({
        status: res.status,
        message: `${extractMessage(body, `request failed with status ${res.status}`)} [${describeRequest(opts.method, url, opts.body, { hasAuth: tok !== undefined, otp: opts.otp })}]`,
        body,
        headers: res.headers,
        request: reqMeta,
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
        message: `response schema validation failed: ${issues} [${describeRequest(opts.method, url, opts.body, { hasAuth: tok !== undefined, otp: opts.otp })}]`,
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
 * Resolve a client argument: use the provided one, else the global default.
 * Throws a clear error if neither is available.
 */
export function resolveClient(client?: NpmClient | null): NpmClient {
  const resolved = client ?? defaultClient;
  if (!resolved) {
    throw new Error(
      "No npm client provided. Pass a client to the operation, or set one with setDefaultClient(createClient({...})).",
    );
  }
  return resolved;
}
