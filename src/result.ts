import type { NpmApiError } from "./error";

/**
 * Raw HTTP response metadata, preserved on both success and failure results.
 *
 * npm returns important information via response headers and even in error
 * bodies (e.g. the WebAuthn `authUrl`/`doneUrl` on a 401), so callers always
 * have access to the underlying response.
 */
export interface ApiResponse<T> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T | unknown;
}

/**
 * The discriminated result of an API call. Never throws — always return this
 * and branch on `.ok`.
 */
export type Result<T> = OkResult<T> | ErrResult<T>;

export interface OkResult<T> {
  readonly ok: true;
  readonly data: T;
  readonly response: ApiResponse<T>;
  /** Unwrap the value; throws `NpmApiError` if this is an error result. */
  unwrap(): T;
  /** Unwrap the value, or return `fallback` if this is an error result. */
  unwrapOr<U>(fallback: U): T | U;
  /** Map the success value; errors pass through unchanged. */
  map<U>(fn: (data: T) => U): Result<U>;
}

export interface ErrResult<T> {
  readonly ok: false;
  readonly error: NpmApiError;
  readonly response: ApiResponse<T>;
  /** Unwrap the value; throws `NpmApiError` if this is an error result. */
  unwrap(): never;
  /** Unwrap the value, or return `fallback` if this is an error result. */
  unwrapOr<U>(fallback: U): U;
  /** Map the success value; errors pass through unchanged. */
  map<U>(fn: (data: T) => U): Result<U>;
}

/** Build a success result. */
export function ok<T>(data: T, response: ApiResponse<T>): OkResult<T> {
  return {
    ok: true,
    data,
    response,
    unwrap: () => data,
    unwrapOr: <U>(_fallback: U): T | U => data,
    map: <U>(fn: (data: T) => U): Result<U> => {
      const mapped = fn(data);
      return ok(mapped, response as ApiResponse<U>) as Result<U>;
    },
  };
}

/** Build an error result. */
export function err<T>(error: NpmApiError, response: ApiResponse<T>): ErrResult<T> {
  return {
    ok: false,
    error,
    response,
    unwrap: (): never => {
      throw error;
    },
    unwrapOr: <U>(fallback: U): U => fallback,
    map: <U>(_fn: (data: T) => U): Result<U> => err(error, response as ApiResponse<U>) as Result<U>,
  };
}
