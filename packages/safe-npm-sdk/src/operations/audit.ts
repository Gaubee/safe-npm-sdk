import { type NpmClient, resolveClient } from "../client";
import type { Result } from "../result";
import {
  type BulkAuditInput,
  BulkAuditInputSchema,
  type BulkAuditResponse,
  BulkAuditResponseSchema,
} from "../schemas/audit";

/**
 * Get security advisories for a set of packages and versions.
 *
 * `POST /-/npm/v1/security/advisories/bulk`
 *
 * The input maps package names to the list of versions to audit; the response
 * maps package names to the advisories that apply.
 */
export async function bulkAudit(
  input: BulkAuditInput,
  client?: NpmClient,
): Promise<Result<BulkAuditResponse>> {
  const c = resolveClient(client);
  const body = BulkAuditInputSchema.parse(input);
  return c.request({
    method: "POST",
    path: "/-/npm/v1/security/advisories/bulk",
    body,
    schema: BulkAuditResponseSchema,
  });
}
