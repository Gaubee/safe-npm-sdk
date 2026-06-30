import { http, HttpResponse } from "msw";
import { type SetupServerApi, setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { type NpmClient, createClient } from "../src/client";

export const REGISTRY = "https://registry.npmjs.org";
export const TOKEN = "npm_test_token_xxx";

/** Create a client pointed at the (mocked) registry. */
export function makeClient(
  overrides: Partial<ConstructorParameters<typeof createClient>[0]> = {},
): NpmClient {
  return createClient({
    auth: { token: TOKEN },
    registry: REGISTRY,
    retries: 0,
    timeout: 2000,
    ...overrides,
  });
}

/** Start an MSW server intercepting all registry requests. */
export function startServer(): SetupServerApi {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

/** Shorthand for an MSW http handler builder bound to the registry. */
export const reg = {
  get: (path: string, resolver: Parameters<typeof http.get>[1]) =>
    http.get(`${REGISTRY}${path}`, resolver),
  post: (path: string, resolver: Parameters<typeof http.post>[1]) =>
    http.post(`${REGISTRY}${path}`, resolver),
  put: (path: string, resolver: Parameters<typeof http.put>[1]) =>
    http.put(`${REGISTRY}${path}`, resolver),
  delete: (path: string, resolver: Parameters<typeof http.delete>[1]) =>
    http.delete(`${REGISTRY}${path}`, resolver),
};

export { HttpResponse };
