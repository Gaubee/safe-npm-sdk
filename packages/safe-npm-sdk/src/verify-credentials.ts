import { type NpmClient, resolveClient } from "./client";
import { deleteToken, listTokens } from "./operations/tokens";
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
 *   token is valid; a 401 means it's invalid/expired.
 * - **OTP** is verified by attempting `deleteToken()` against a token id that is
 *   guaranteed not to exist. The registry validates OTP early in its request
 *   pipeline (before looking up the token), so:
 *     - wrong/missing OTP → 401 (OTP rejected, before the token lookup)
 *     - correct OTP       → 404/400 (token not found, *after* OTP passed)
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
  client?: NpmClient | null,
  opts: { otp?: string | null } = {},
): Promise<Result<VerificationResult>> {
  const c = resolveClient(client);
  const otp = opts.otp ?? null;

  // --- Step 1: verify auth with a read-only GET. ---
  const tokensRes = await listTokens(c);
  if (!tokensRes.ok) {
    // A 401/403 here means the token itself is bad.
    const authInvalid = tokensRes.error.status === 401 || tokensRes.error.status === 403;
    return ok(
      {
        authValid: !authInvalid,
        requires2FA: false,
        otpValid: null,
        message: authInvalid
          ? `auth invalid (HTTP ${tokensRes.error.status})`
          : `auth check failed (HTTP ${tokensRes.error.status}): ${tokensRes.error.message}`,
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
  // up the token, so a wrong OTP yields 401 while a correct one yields 404/400.
  const phantomId = "0".repeat(40);
  const delRes = await deleteToken(phantomId, { otp }, c);

  // 404 or 400 = "token not found" → OTP was accepted (we got past the OTP gate).
  const otpPassed = delRes.ok || delRes.error.status === 404 || delRes.error.status === 400;
  // 401/403 = OTP (or auth) rejected at the gate.
  const otpRejected = !delRes.ok && (delRes.error.status === 401 || delRes.error.status === 403);

  return ok(
    {
      authValid: true,
      tokens,
      requires2FA: otpRejected,
      otpValid: otpPassed,
      message: otpPassed
        ? "auth valid, OTP valid"
        : otpRejected
          ? "auth valid, OTP invalid"
          : `auth valid, OTP check inconclusive (delete returned HTTP ${delRes.error.status})`,
    },
    delRes.response as unknown as VResponse,
  );
}
