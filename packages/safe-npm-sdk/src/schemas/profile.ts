import { z } from "zod";

/**
 * The `tfa` field of a [Profile], as defined by the npm registry. It is
 * polymorphic and depends on the account's 2FA state:
 *
 * - `null` / `false`      — 2FA disabled (or unaffected by a profile update).
 * - `"otpauth://..."`     — 2FA is being enabled; this URL encodes the TOTP
 *                           secret and should be rendered as a QR code, after
 *                           which a one-time code must be submitted to confirm.
 * - `string[]`            — single-use recovery codes, returned once 2FA setup
 *                           completes. Save these securely.
 * - `{ mode, pending? }`  — 2FA setup is in progress; `mode` is the requested
 *                           strength (`auth-only` | `auth-and-writes`).
 *
 * @see https://github.com/npm/registry/blob/main/docs/user/profile.md
 */
export const TfaSchema = z.union([
  z.null(),
  z.boolean(),
  z.string(), // covers the "otpauth://..." URL case
  z.array(z.string()), // recovery codes
  z.object({
    mode: z.enum(["auth-only", "auth-and-writes"]),
    pending: z.boolean().optional(),
  }),
]);
export type Tfa = z.infer<typeof TfaSchema>;

/** True when `tfa` is the `otpauth://` URL returned at the start of 2FA setup. */
export function tfaIsOtpauth(tfa: Tfa): tfa is string {
  return typeof tfa === "string";
}

/** True when `tfa` is an array of one-time recovery codes. */
export function tfaIsRecoveryCodes(tfa: Tfa): tfa is string[] {
  return Array.isArray(tfa);
}

/**
 * A user's profile, as returned by `GET /-/npm/v1/user`. Fields marked optional
 * may be absent; the schema is passthrough so the registry can add fields.
 */
export const ProfileSchema = z
  .object({
    tfa: TfaSchema.nullish(),
    name: z.string(),
    email: z.string().nullish(),
    email_verified: z.boolean().nullish(),
    created: z.string().nullish(),
    updated: z.string().nullish(),
    cidr_whitelist: z.array(z.string()).nullish(),
    fullname: z.string().nullish(),
    homepage: z.string().nullish(),
    freenode: z.string().nullish(),
    twitter: z.string().nullish(),
    github: z.string().nullish(),
  })
  .passthrough();
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * A profile update request body for `POST /-/npm/v1/user`. Every field is
 * optional; send only what you want to change.
 */
export const ProfileUpdateSchema = z
  .object({
    password: z
      .object({
        old: z.string(),
        new: z.string(),
      })
      .optional(),
    fullname: z.string().optional(),
    homepage: z.string().optional(),
    freenode: z.string().optional(),
    twitter: z.string().optional(),
    github: z.string().optional(),
    email: z.string().optional(),
    tfa: z
      .union([
        z.object({
          password: z.string(),
          mode: z.enum(["disable", "auth-only", "auth-and-writes"]),
        }),
        // A single-element `[code]` array submits the one-time code that
        // completes 2FA setup.
        z.array(z.string()),
      ])
      .optional(),
  })
  .passthrough();
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

/**
 * Result of a successful couch login (`PUT
 * /-/user/org.couchdb.user:{username}`). On success the registry returns the
 * user document, which (when logged in) carries a `token`. Passthrough so any
 * extra document fields survive.
 */
export const CouchLoginResultSchema = z
  .object({
    token: z.string().nullish(),
    _id: z.string().nullish(),
    name: z.string().nullish(),
    roles: z.array(z.string()).nullish(),
  })
  .passthrough();
export type CouchLoginResult = z.infer<typeof CouchLoginResultSchema>;

/** Response from `POST /-/v1/login` initiating a web login flow. */
export const WebLoginInitSchema = z.object({
  loginUrl: z.string().url(),
  doneUrl: z.string().url(),
});
export type WebLoginInit = z.infer<typeof WebLoginInitSchema>;
