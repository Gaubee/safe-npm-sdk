/**
 * Error thrown by the npm registry API when a request fails.
 *
 * Carries the HTTP status, the parsed response body, and the raw response
 * headers so callers can inspect npm-specific headers such as `npm-notice`
 * (e.g. the one-time token reveal warning on `createToken`).
 */
export class NpmApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
  readonly request?: { method: string; path: string };

  constructor(opts: {
    status: number;
    message: string;
    body: unknown;
    headers: Headers;
    request?: { method: string; path: string };
  }) {
    super(opts.message);
    this.name = "NpmApiError";
    this.status = opts.status;
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
