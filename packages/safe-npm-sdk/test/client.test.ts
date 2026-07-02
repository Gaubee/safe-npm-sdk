import { beforeEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { http } from "msw";
import { createClient, getDefaultClient, resolveClient, setDefaultClient } from "../src/client";
import { escapePackageName } from "../src/encode";
import { HttpResponse, TOKEN, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("request engine: url & query", () => {
  it("builds the path and query string correctly", async () => {
    server.use(
      reg.get("/-/v1/search", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("text")).toBe("lodash");
        expect(url.searchParams.get("size")).toBe("10");
        return HttpResponse.json({ objects: [], total: 0 });
      }),
    );
    const c = makeClient();
    const r = await c.request({
      method: "GET",
      path: "/-/v1/search",
      query: { text: "lodash", size: 10 },
      schema: z.object({ objects: z.array(z.unknown()) }),
    });
    expect(r.ok).toBe(true);
  });

  it("drops undefined query params", async () => {
    server.use(
      reg.get("/-/v1/search", ({ request }) => {
        expect(new URL(request.url).searchParams.has("from")).toBe(false);
        return HttpResponse.json({ objects: [] });
      }),
    );
    const c = makeClient();
    await c.request({
      method: "GET",
      path: "/-/v1/search",
      query: { text: "x", from: undefined },
      schema: z.object({ objects: z.array(z.unknown()) }),
    });
  });

  it("resolves a relative registry against document.baseURI (browser)", async () => {
    // Simulate a browser with a same-origin proxy at /api.
    const original = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: { baseURI: string } }).document = {
      baseURI: "http://localhost:5173/app/",
    };
    try {
      let hit: string | null = null;
      server.use(
        http.get("http://localhost:5173/api/-/v1/search", ({ request }) => {
          hit = new URL(request.url).pathname;
          return HttpResponse.json({ objects: [] });
        }),
      );
      const c = makeClient({ registry: "/api" });
      const r = await c.request({
        method: "GET",
        path: "/-/v1/search",
        query: { text: "zod" },
        schema: z.object({ objects: z.array(z.unknown()) }),
      });
      expect(r.ok).toBe(true);
      // Absolute "/-/v1/search" path ignores the base's "/app/" subpath.
      expect(hit).toBe("/api/-/v1/search");
    } finally {
      if (original === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document: unknown }).document = original;
      }
    }
  });
});

describe("request engine: auth & otp headers", () => {
  it("sends Authorization: Bearer <token>", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
        return HttpResponse.json({ objects: [], total: 0 });
      }),
    );
    const c = makeClient();
    await c.request({ method: "GET", path: "/-/npm/v1/tokens", schema: z.unknown() });
  });

  it("sends npm-otp header when provided", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("123456");
        return HttpResponse.json({ key: "abc" }, { status: 201 });
      }),
    );
    const c = makeClient();
    await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      otp: "123456",
      schema: z.object({ key: z.string() }),
    });
  });

  it("sends extra headers (npm-auth-type / npm-command)", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("npm-auth-type")).toBe("web");
        expect(request.headers.get("npm-command")).toBe("token");
        return HttpResponse.json({ key: "abc" }, { status: 201 });
      }),
    );
    const c = makeClient();
    await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      extraHeaders: { "npm-auth-type": "web", "npm-command": "token" },
      schema: z.object({ key: z.string() }),
    });
  });

  it("uses oidcIdToken bearer when configured", async () => {
    server.use(
      reg.post("/-/npm/v1/oidc/token/exchange/package/foo", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer my-oidc-jwt");
        return HttpResponse.json(
          { token_type: "oidc", token: "t", created: "x", expires: "y" },
          { status: 201 },
        );
      }),
    );
    const c = createClient({ auth: { oidcIdToken: "my-oidc-jwt" }, retries: 0 });
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/oidc/token/exchange/package/foo",
      schema: z.object({ token: z.string() }),
    });
    expect(r.ok).toBe(true);
  });

  it("does not send Authorization when the client has no auth (anonymous)", async () => {
    server.use(
      reg.get("/-/v1/search", ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull();
        return HttpResponse.json({ objects: [] });
      }),
    );
    const c = makeClient({ auth: undefined });
    const r = await c.request({
      method: "GET",
      path: "/-/v1/search",
      schema: z.object({ objects: z.array(z.unknown()) }),
    });
    expect(r.ok).toBe(true);
  });

  it("does not send npm-otp when otp is null", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBeNull();
        return HttpResponse.json({ key: "abc" }, { status: 201 });
      }),
    );
    const c = makeClient();
    await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      otp: null,
      schema: z.object({ key: z.string() }),
    });
  });

  it("sends npm-otp when otp is a string", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("998877");
        return HttpResponse.json({ key: "abc" }, { status: 201 });
      }),
    );
    const c = makeClient();
    await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      otp: "998877",
      schema: z.object({ key: z.string() }),
    });
  });

  it("reports auth=anonymous/otp=no in the error message", async () => {
    server.use(
      reg.get("/-/v1/search", () => HttpResponse.json({ message: "nope" }, { status: 403 })),
    );
    const c = makeClient({ auth: undefined });
    const r = await c.request({
      method: "GET",
      path: "/-/v1/search",
      otp: null,
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("auth=anonymous");
      expect(r.error.message).toContain("otp=no");
    }
  });

  it("reports auth=yes/otp=yes in the error message", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", () =>
        HttpResponse.json({ message: "bad otp" }, { status: 401 }),
      ),
    );
    const c = makeClient();
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      otp: "123456",
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("auth=yes");
      expect(r.error.message).toContain("otp=yes");
    }
  });
});

describe("request engine: notice & errors", () => {
  it("invokes onNotice for the npm-notice header", async () => {
    const notices: string[] = [];
    server.use(
      reg.get("/-/npm/v1/tokens", () =>
        HttpResponse.json({ objects: [] }, { headers: { "npm-notice": "token limit reached" } }),
      ),
    );
    const c = makeClient({ onNotice: (n) => notices.push(n) });
    await c.request({ method: "GET", path: "/-/npm/v1/tokens", schema: z.unknown() });
    expect(notices).toEqual(["token limit reached"]);
  });

  it("returns an error result on 4xx with a redacted request description", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
    );
    const c = makeClient();
    const r = await c.request({ method: "GET", path: "/-/npm/v1/tokens", schema: z.unknown() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.status).toBe(401);
      // The error is classified as a general HTTP error (no www-authenticate
      // challenge): npm-registry-fetch-style "401 - METHOD url - <detail>".
      expect(r.error.code).toBe("E401");
      // message includes the body detail and the request line.
      expect(r.error.message).toContain("Unauthorized");
      expect(r.error.message).toContain("GET ");
      expect(r.error.message).toContain("/-/npm/v1/tokens");
      // no token leak in the message
      expect(r.error.message.includes(TOKEN)).toBe(false);
      // response still exposed
      expect(r.response.status).toBe(401);
    }
  });

  it("returns an error result on schema validation failure", async () => {
    server.use(reg.get("/x", () => HttpResponse.json({ nope: true })));
    const c = makeClient();
    const r = await c.request({
      method: "GET",
      path: "/x",
      schema: z.object({ required: z.string() }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.status).toBe(200);
  });

  it("redacts sensitive query/body fields in the error message", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", () => HttpResponse.json({ message: "bad" }, { status: 400 })),
    );
    const c = makeClient();
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/tokens",
      query: { npm_otp: "123456", text: "ok" },
      body: { password: "s3cret", name: "mytoken", token: "leak_me" },
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msg = r.error.message;
      // sensitive values must never appear
      expect(msg.includes("s3cret")).toBe(false);
      expect(msg.includes("leak_me")).toBe(false);
      expect(msg.includes("123456")).toBe(false);
      // sensitive keys are masked, harmless ones are visible
      expect(msg.includes('"password":"***"')).toBe(true);
      expect(msg.includes('"token":"***"')).toBe(true);
      expect(msg.includes("mytoken")).toBe(true);
    }
  });
});

describe("request engine: retry", () => {
  it("retries 5xx up to the configured limit then gives up", async () => {
    let calls = 0;
    server.use(
      reg.get("/-/x", () => {
        calls += 1;
        return HttpResponse.json({ message: "down" }, { status: 500 });
      }),
    );
    const c = makeClient({ retries: 2, timeout: 50 });
    const r = await c.request({ method: "GET", path: "/-/x", schema: z.unknown() });
    expect(r.ok).toBe(false);
    expect(calls).toBe(3); // initial + 2 retries
  });
});

describe("global default client", () => {
  beforeEach(() => setDefaultClient(null));

  it("getDefaultClient returns null by default", () => {
    expect(getDefaultClient()).toBeNull();
  });

  it("resolveClient throws a clear error when none is set", () => {
    expect(() => resolveClient()).toThrow(/No npm client provided/);
  });

  it("resolveClient uses the global default when set", () => {
    const c = makeClient();
    setDefaultClient(c);
    expect(resolveClient()).toBe(c);
  });

  it("resolveClient prefers an explicit client over the default", () => {
    const global = makeClient();
    const explicit = makeClient();
    setDefaultClient(global);
    expect(resolveClient(explicit)).toBe(explicit);
  });

  // --- null vs undefined convention (see CONTRIBUTING / docs) ---
  //   client = undefined → use the global default (or throw if none)
  //   client = null      → an anonymous client (no Authorization header)
  it("resolveClient(null) returns an anonymous client (no auth), even with a default set", () => {
    const global = makeClient(); // carries a token
    setDefaultClient(global);
    const anon = resolveClient(null);
    // anonymous client has no auth credentials
    expect(anon.auth).toBeUndefined();
    // and is a distinct object from the token-bearing default
    expect(anon).not.toBe(global);
  });

  it("resolveClient(null) caches a single anonymous client", () => {
    expect(resolveClient(null)).toBe(resolveClient(null));
  });

  it("the anonymous client makes requests with no Authorization header", async () => {
    let authHeader: string | null | undefined;
    server.use(
      reg.get("/-/v1/search", ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({ objects: [] });
      }),
    );
    const anon = resolveClient(null);
    await anon.request({ method: "GET", path: "/-/v1/search", schema: z.unknown() });
    expect(authHeader).toBeNull();
  });
});

describe("escapePackageName", () => {
  it("encodes / as %2F for scoped packages", () => {
    expect(escapePackageName("@scope/pkg")).toBe("@scope%2Fpkg");
  });
  it("leaves unscoped names unchanged", () => {
    expect(escapePackageName("lodash")).toBe("lodash");
  });
});
