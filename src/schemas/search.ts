import { z } from "zod";

/** A package maintainer or publisher. */
export const PersonSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
});
export type Person = z.infer<typeof PersonSchema>;

/** Links associated with a package. */
export const PackageLinksSchema = z
  .object({
    homepage: z.string().optional(),
    repository: z.string().optional(),
    bugs: z.string().optional(),
    npm: z.string().optional(),
  })
  .passthrough();
export type PackageLinks = z.infer<typeof PackageLinksSchema>;

/** The `package` sub-object of a search result. */
export const SearchResultPackageSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    description: z.string().nullable().optional(),
    keywords: z.array(z.string()).optional(),
    license: z.string().nullable().optional(),
    date: z.string().optional(),
    sanitized_name: z.string().optional(),
    publisher: PersonSchema.nullable().optional(),
    maintainers: z.array(PersonSchema).optional(),
    links: PackageLinksSchema.optional(),
  })
  .passthrough();
export type SearchResultPackage = z.infer<typeof SearchResultPackageSchema>;

/** A single search result object. */
export const SearchObjectSchema = z.object({
  package: SearchResultPackageSchema,
  downloads: z
    .object({ monthly: z.number().optional(), weekly: z.number().optional() })
    .passthrough()
    .optional(),
  dependents: z.number().optional(),
  updated: z.string().optional(),
  searchScore: z.number().optional(),
  score: z
    .object({ final: z.number().optional(), detail: z.record(z.string(), z.unknown()).optional() })
    .passthrough()
    .optional(),
  flags: z.object({ insecure: z.number().optional() }).passthrough().optional(),
});
export type SearchObject = z.infer<typeof SearchObjectSchema>;

/** The full search response. */
export const SearchResultsSchema = z.object({
  objects: z.array(SearchObjectSchema),
  total: z.number().optional(),
  time: z.string().optional(),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;

/** Input for searching packages. */
export const SearchInputSchema = z.object({
  text: z.string(),
  size: z.number().int().min(1).max(250).optional(),
  from: z.number().int().min(0).optional(),
  quality: z.number().optional(),
  popularity: z.number().optional(),
  maintenance: z.number().optional(),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;
