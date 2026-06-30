/**
 * Escape a package name for use in an npm registry URL path segment.
 *
 * Scoped packages contain a `/` (e.g. `@scope/pkg`) which must be URL-encoded
 * as `%2F` when placed in a path. npm treats this as the canonical escaping.
 *
 * @example
 * escapePackageName("@scope/pkg") // "@scope%2Fpkg"
 * escapePackageName("lodash")     // "lodash"
 */
export function escapePackageName(name: string): string {
  // Replace `/` with %2F; everything else uses standard path encoding via the
  // URL machinery when the full URL is constructed. We only special-case `/`.
  return name.replace(/\//g, "%2F");
}
