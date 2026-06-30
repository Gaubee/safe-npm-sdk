import { type NpmClient, resolveClient } from "../client";
import type { Result } from "../result";
import {
  type SearchInput,
  SearchInputSchema,
  type SearchResults,
  SearchResultsSchema,
} from "../schemas/search";

/**
 * Search for packages on the registry.
 *
 * `GET /-/v1/search?text=...&size=...&from=...`
 */
export async function searchPackages(
  input: SearchInput,
  client?: NpmClient | null,
): Promise<Result<SearchResults>> {
  const c = resolveClient(client);
  const parsed = SearchInputSchema.parse(input);
  return c.request({
    method: "GET",
    path: "/-/v1/search",
    query: {
      text: parsed.text,
      size: parsed.size,
      from: parsed.from,
      quality: parsed.quality,
      popularity: parsed.popularity,
      maintenance: parsed.maintenance,
    },
    schema: SearchResultsSchema,
  });
}
