import { type NpmClient, resolveClient } from "./client";
import { deleteToken, listTokens } from "./operations/tokens";
import type { OtpOptions } from "./operations/tokens";
import { ok, type ApiResponse, type Result } from "./result";
import type { Token } from "./schemas/tokens";

type VResponse = ApiResponse<VerificationResult>;

/** Outcome of a credentials verification. */
export interface VerificationResult {
  /** Whether the auth token is valid and accepted by the registry. */
  authValid: boolean;
  /** The token objects seen by the registry (from listTokens), if auth is valid. */
  tokens?: Token[];
  /**
   * Whether 2FA is required for this account. `true` if the registry rejected a
   * write without OTP; `false` if it accepted one.
   */
  requires2FA: boolean;
  /**
   * Whether the supplied OTP was accepted. Only meaningful when an OTP was
   * supplied. `null` when not checked.
   */
  otpValid: boolean | null;
  /** A human-readable summary, convenient for logging/UI. */
  message: string;
}

/**
 * Verify that a client's credentials (and optionally its OTP) are valid,
 * **without any side effects**.
 *
 * - **Auth** is verified with `listTokens()` (a read-only GET). A 200 means the
 *   token is valid. A `401`/`403` means it's invalid/expired — but the registry
 *   uses distinct error codes, so we tell them apart:
 *     - `E401`/403 (bad/expired token) → auth invalid.
 *     - `EOTP` (one-time password required even to read tokens) → auth is
 *       valid but the account mandates 2FA; not an auth failure.
 *     - `EAUTHIP` (login not allowed from this IP) → auth is valid but the IP
 *       is blocked; not an auth failure.
 * - **OTP** is verified by attempting `deleteToken()` against a token id that is
 *   guaranteed not to exist. The registry validates OTP early in its request
 *   pipeline (before looking up the token), so:
 *     - wrong/missing OTP → `EOTP` (rejected before the token lookup)
 *     - correct OTP       → `E404`/`E400` (token not found, *after* OTP passed)
 *   This makes OTP verification side-effect-free: no real token is ever deleted.
 *
 * If `otp` is omitted/`null`, only auth is checked and `otpValid` is `null`.
 *
 * @example
 * ```ts
 * const r = await verifyCredentials(client, { otp: "123456" });
 * if (r.authValid && r.otpValid) console.log("all good");
 * ```
 */
export async function verifyCredentials(
  client?: NpmClient,
  opts: Pick<OtpOptions, "otp"> = {},
): Promise<Result<VerificationResult>> {
  const c = resolveClient(client);
  const otp = opts.otp ?? null;

  // --- Step 1: verify auth with a read-only GET. ---
  const tokensRes = await listTokens(c);
  if (!tokensRes.ok) {
    const code = tokensRes.error.code;
    // EOTP/EAUTHIP mean the token was accepted but the account/IP restricts the
    // request — the auth itself is valid. Only E401 (bad/expired token) or an
    // explicit 403 is a real auth failure. Anything else is an unexpected error.
    const authInvalid = code === "E401" || tokensRes.error.status === 403;
    const authRestricted = code === "EOTP" || code === "EAUTHIP";
    return ok(
      {
        authValid: !authInvalid,
        requires2FA: code === "EOTP",
        otpValid: null,
        message: authInvalid
          ? `auth invalid (${code})`
          : authRestricted
            ? code === "EOTP"
              ? "auth valid, but account requires 2FA even to read tokens"
              : "auth valid, but this IP address is not allowed"
            : `auth check failed (${code}): ${tokensRes.error.message}`,
      },
      tokensRes.response as unknown as VResponse,
    );
  }

  const tokens = tokensRes.data.objects ?? [];

  // No OTP supplied → we can only confirm auth.
  if (otp === null) {
    return ok(
      {
        authValid: true,
        tokens,
        requires2FA: false,
        otpValid: null,
        message: "auth valid (OTP not checked)",
      },
      tokensRes.response as unknown as VResponse,
    );
  }

  // --- Step 2: verify OTP by deleting a token that cannot exist. ---
  // A valid-format but nonexistent id. The registry checks OTP before looking
  // up the token, so a wrong OTP yields EOTP while a correct one yields E404/E400.
  const phantomId = "0".repeat(40);
  const delRes = await deleteToken(phantomId, { otp }, c);

  // E404/E400 = "token not found" → OTP was accepted (we got past the OTP gate).
  const otpPassed = delRes.ok || delRes.error.code === "E404" || delRes.error.code === "E400";
  // EOTP = the one-time password was rejected at the gate.
  const otpRejected = !delRes.ok && delRes.error.code === "EOTP";
  // EAUTHIP = not an OTP problem; the IP is blocked. Report it distinctly so the
  // caller isn't told their OTP is wrong.
  const ipBlocked = !delRes.ok && delRes.error.code === "EAUTHIP";

  return ok(
    {
      authValid: true,
      tokens,
      requires2FA: otpRejected,
      otpValid: ipBlocked ? null : otpPassed,
      message: otpPassed
        ? "auth valid, OTP valid"
        : otpRejected
          ? "auth valid, OTP invalid"
          : ipBlocked
            ? "auth valid, but this IP address is not allowed (OTP not checked)"
            : `auth valid, OTP check inconclusive (${delRes.error.code})`,
    },
    delRes.response as unknown as VResponse,
  );
}
