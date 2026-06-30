import { z } from "zod";

/** A staged package version. */
export const StagePackageVersionSchema = z.object({
  id: z.string().uuid(),
  packageName: z.string().optional(),
  version: z.string().optional(),
  tag: z.string().optional(),
  createdAt: z.string().optional(),
  actor: z.string().optional(),
  actorType: z.string().optional(),
  access: z.enum(["public", "private"]).optional(),
  shasum: z.string().optional(),
});
export type StagePackageVersion = z.infer<typeof StagePackageVersionSchema>;

/** Paginated list of staged package versions. */
export const StagePackageListSchema = z.object({
  items: z.array(StagePackageVersionSchema),
  page: z.number().optional(),
  perPage: z.number().optional(),
  total: z.number().optional(),
});
export type StagePackageList = z.infer<typeof StagePackageListSchema>;

/** Query options for listing staged package versions. */
export const StageListInputSchema = z.object({
  package: z.string().optional(),
  page: z.number().int().min(0).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
});
export type StageListInput = z.infer<typeof StageListInputSchema>;

/** A base64-encoded attachment (tarball or provenance bundle). */
export const StageAttachmentSchema = z.object({
  data: z.string(),
  content_type: z
    .enum(["application/octet-stream", "application/vnd.dev.sigstore.bundle+json;version=0.3"])
    .optional(),
});
export type StageAttachment = z.infer<typeof StageAttachmentSchema>;

/** Request body for staging a package version. */
export const StagedPackumentRequestSchema = z
  .object({
    _id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
    access: z.enum(["public", "private"]).optional(),
    versions: z.record(z.string(), z.record(z.string(), z.unknown())),
    "dist-tags": z.record(z.string(), z.string()).optional(),
    readme: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    main: z.string().optional(),
    _attachments: z.record(z.string(), StageAttachmentSchema),
  })
  .passthrough();
export type StagedPackumentRequest = z.infer<typeof StagedPackumentRequestSchema>;

/** Response from staging a package version. */
export const StagePackageVersionResponseSchema = z
  .object({
    message: z.string().optional(),
    stageId: z.string().uuid().optional(),
  })
  .passthrough();
export type StagePackageVersionResponse = z.infer<typeof StagePackageVersionResponseSchema>;

/** Response from approving a staged package version. */
export const ApproveStageResponseSchema = z
  .object({ message: z.string().optional() })
  .passthrough();
export type ApproveStageResponse = z.infer<typeof ApproveStageResponseSchema>;
