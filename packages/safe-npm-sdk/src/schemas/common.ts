import { z } from "zod";

/** A map of string keys to string values, used by many npm list endpoints. */
export const StringMapSchema = z.record(z.string(), z.string());
export type StringMap = z.infer<typeof StringMapSchema>;

/** Standard error body shape returned by most npm endpoints. */
export const ErrorResponseSchema = z
  .object({
    message: z.string().optional(),
    error: z.string().optional(),
    code: z.string().optional(),
    statusCode: z.number().optional(),
  })
  .passthrough();
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** WebAuthn challenge returned on certain 401 responses. */
export const WebAuthnChallengeSchema = z.object({
  authUrl: z.string().url(),
  doneUrl: z.string().url(),
});
export type WebAuthnChallenge = z.infer<typeof WebAuthnChallengeSchema>;

/** Generic "success" body. */
export const SuccessSchema = z.object({ success: z.literal(true) });
export type Success = z.infer<typeof SuccessSchema>;

/** Void/no-body schema (for 204 responses). */
export const VoidSchema = z.unknown();
export type Void = z.infer<typeof VoidSchema>;
