import { z } from "zod";

/** Input for the bulk audit endpoint: packageName -> versions[]. */
export const BulkAuditInputSchema = z.record(z.string(), z.array(z.string()));
export type BulkAuditInput = z.infer<typeof BulkAuditInputSchema>;

/** A single advisory/vulnerability entry. */
export const AdvisorySchema = z
  .object({
    id: z.coerce.number(),
    url: z.string().optional(),
    title: z.string().optional(),
    severity: z.enum(["info", "low", "moderate", "high", "critical"]).optional(),
    vulnerable_versions: z.string().optional(),
    cwe: z.array(z.string()).optional(),
    cvss: z
      .object({ score: z.coerce.number().optional(), vector: z.string().optional() })
      .passthrough()
      .optional(),
    overview: z.string().optional(),
    path: z.array(z.string()).optional(),
    advisoryUrl: z.string().optional(),
  })
  .passthrough();
export type Advisory = z.infer<typeof AdvisorySchema>;

/** Bulk audit response: packageName -> advisory[]. */
export const BulkAuditResponseSchema = z.record(z.string(), z.array(AdvisorySchema));
export type BulkAuditResponse = z.infer<typeof BulkAuditResponseSchema>;
