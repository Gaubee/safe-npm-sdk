import type { ZodType } from "zod";
import { NpmApiError } from "./error";
import { type Result, err, ok } from "./result";

/** Authentication credentials. */
export type Auth = { readonly token: string } | { readonly oidcIdToken: string };

/** Options for constructing a client. */
export interface ClientOptions {
  /** Authentication credentials. Required. */
  auth: Auth;
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
  /** OTP for 2FA. Injected as the `npm-otp` header. */
  otp?: string;
  /** Extra npm headers (npm-auth-type, npm-command, ...). */
  extraHeaders?: Record<string, string>;
}

/** An authenticated npm registry client. */
export interface NpmClient {
  readonly registry: string;
  readonly auth: Auth;
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
  const url = new URL(`${registry}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function authHeader(auth: Auth): string {
  const tok = "token" in auth ? auth.token : auth.oidcIdToken;
  return `Bearer ${tok}`;
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

async function doRequest(
  client: NpmClient,
  fetchImpl: typeof fetch,
  onNotice: ((n: string) => void) | undefined,
  opts: RequestOptions,
): Promise<Result<unknown>> {
  const url = buildUrl(client.registry, opts.path, opts.query);

  const headers = new Headers({
    Authorization: authHeader(client.auth),
    Accept: "application/json",
    ...opts.extraHeaders,
  });
  if (opts.otp !== undefined) headers.set("npm-otp", opts.otp);
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
        message: e instanceof Error ? `network error: ${e.message}` : "network error",
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
        message: extractMessage(body, `request failed with status ${res.status}`),
        body,
        headers: res.headers,
        request: reqMeta,
      });
      return err(error, { status: res.status, headers: res.headers, body });
    }

    // Success: validate with zod schema.
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) {
      const error = new NpmApiError({
        status: res.status,
        message: `response schema validation failed: ${parsed.error.message}`,
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
