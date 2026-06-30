import { z } from "zod";

/** A dist (distribution) sub-object within a published version. */
export const DistSchema = z
  .object({
    integrity: z.string().optional(),
    shasum: z.string().optional(),
    tarball: z.string().optional(),
  })
  .passthrough();
export type Dist = z.infer<typeof DistSchema>;

/** A version manifest (a single entry in the `versions` map). */
export const VersionManifestSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    dist: DistSchema.optional(),
  })
  .passthrough();
export type VersionManifest = z.infer<typeof VersionManifestSchema>;

/** A tarball/provenance attachment. */
export const AttachmentSchema = z.object({
  content_type: z.string().optional(),
  data: z.string().optional(),
  length: z.number().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * The packument body for publishing a package version.
 *
 * Loosely typed (passthrough) because the manifest is flexible; callers
 * typically build it from their package.json.
 */
export const PublishPackumentSchema = z
  .object({
    _id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    "dist-tags": z.record(z.string(), z.string()).optional(),
    dist: DistSchema.optional(),
    versions: z.record(z.string(), VersionManifestSchema).optional(),
    readme: z.string().optional(),
    access: z.enum(["public", "restricted"]).optional(),
    _attachments: z.record(z.string(), AttachmentSchema).optional(),
  })
  .passthrough();
export type PublishPackument = z.infer<typeof PublishPackumentSchema>;

/** Successful publish response. */
export const PublishSuccessSchema = z.object({ success: z.literal(true) });
export type PublishSuccess = z.infer<typeof PublishSuccessSchema>;
