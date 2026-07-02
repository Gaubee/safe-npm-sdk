/**
 * Errors thrown/returned by the npm registry API when a request fails.
 *
 * The base {@link NpmApiError} carries the HTTP status, the parsed response
 * body, and the raw response headers so callers can inspect npm-specific
 * headers such as `npm-notice`. Mirroring `npm-registry-fetch/lib/errors.js`,
 * the base is specialized into subclasses that capture the registry's
 * authentication semantics:
 *
 * - {@link NpmApiErrorGeneral} — any non-auth error; `code = "E<status>"`.
 * - {@link NpmApiErrorAuthOTP} — 401 indicating a one-time password is needed.
 * - {@link NpmApiErrorAuthIPAddress} — 401 rejecting the caller's IP.
 * - {@link NpmApiErrorAuthUnknown} — 401 with an unrecognized challenge.
 *
 * Every subclass `extends NpmApiError`, so `instanceof NpmApiError` keeps
 * working for all of them.
 */
export class NpmApiError extends Error {
  readonly status: number;
  /** Semantic code, e.g. `E409`, `EOTP`, `EAUTHIP`. See subclasses. */
  readonly code: string;
  readonly body: unknown;
  readonly headers: Headers;
  readonly request?: { method: string; path: string };

  constructor(opts: {
    status: number;
    message: string;
    body: unknown;
    headers: Headers;
    /** Semantic error code, e.g. `E409`, `EOTP`. Defaults to `E<status>`. */
    code?: string;
    request?: { method: string; path: string } | undefined;
  }) {
    super(opts.message);
    this.name = this.constructor.name;
    this.status = opts.status;
    this.code = opts.code ?? `E${opts.status}`;
    this.body = opts.body;
    this.headers = opts.headers;
    if (opts.request !== undefined) this.request = opts.request;
  }

  /** Convenience accessor for the `npm-notice` response header, if present. */
  get notice(): string | null {
    return this.headers.get("npm-notice");
  }

  /** Whether this is a client error (4xx). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** Whether this is a server error (5xx). */
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/** Error message detail extracted from a JSON error body, mirroring npm-registry-fetch. */
export function detailFromBody(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const text =
      (typeof b.error === "string" && b.error) ||
      (typeof b.message === "string" && b.message) ||
      "";
    if (text && text !== "{}") return ` - ${text}`;
  }
  return "";
}

/**
 * General HTTP error for any non-auth failure. `code = "E<status>"` (e.g.
 * `E409`, `E404`, `E500`).
 */
export class NpmApiErrorGeneral extends NpmApiError {
  constructor(opts: {
    status: number;
    statusText?: string;
    method: string;
    url: string;
    body: unknown;
    headers: Headers;
    request?: { method: string; path: string } | undefined;
  }) {
    const detail = detailFromBody(opts.body);
    const method = opts.method.toUpperCase();
    const message =
      `${opts.status} ${opts.statusText ?? ""} - ${method} ${opts.url}${detail}`.trim();
    super({
      status: opts.status,
      message,
      body: opts.body,
      headers: opts.headers,
      code: `E${opts.status}`,
      request: opts.request,
    });
  }
}

/** 401 indicating a one-time password is required. `code = "EOTP"`. */
export class NpmApiErrorAuthOTP extends NpmApiError {
  constructor(opts: {
    status: number;
    body: unknown;
    headers: Headers;
    request?: { method: string; path: string } | undefined;
  }) {
    super({
      status: opts.status,
      message: "OTP required for authentication",
      body: opts.body,
      headers: opts.headers,
      code: "EOTP",
      request: opts.request,
    });
  }
}

/** 401 indicating the caller's IP address is not allowed. `code = "EAUTHIP"`. */
export class NpmApiErrorAuthIPAddress extends NpmApiError {
  constructor(opts: {
    status: number;
    body: unknown;
    headers: Headers;
    request?: { method: string; path: string } | undefined;
  }) {
    super({
      status: opts.status,
      message: "Login is not allowed from your IP address",
      body: opts.body,
      headers: opts.headers,
      code: "EAUTHIP",
      request: opts.request,
    });
  }
}

/** 401 with an unrecognized `www-authenticate` challenge. `code = "E401"`. */
export class NpmApiErrorAuthUnknown extends NpmApiError {
  constructor(opts: {
    status: number;
    body: unknown;
    headers: Headers;
    request?: { method: string; path: string } | undefined;
  }) {
    const challenge = opts.headers.get("www-authenticate");
    super({
      status: opts.status,
      message: `Unable to authenticate, need: ${challenge ?? "(no www-authenticate)"}`,
      body: opts.body,
      headers: opts.headers,
      code: "E401",
      request: opts.request,
    });
  }
}
