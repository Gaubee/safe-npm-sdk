import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import {
  NpmApiError,
  NpmApiErrorAuthIPAddress,
  NpmApiErrorAuthOTP,
  NpmApiErrorAuthUnknown,
  NpmApiErrorGeneral,
  createClient,
} from "../src";
import { HttpResponse, REGISTRY, startServer, reg } from "./helpers";

const server = startServer();

describe("error classification (npm-registry-fetch parity)", () => {
  it("401 + www-authenticate: otp -> NpmApiErrorAuthOTP / EOTP", async () => {
    server.use(
      reg.post("/-/npm/v1/user", () =>
        HttpResponse.json(
          { error: "Must supply a one-time pass" },
          { status: 401, headers: { "www-authenticate": "OTP" } },
        ),
      ),
    );
    const c = createClient({ auth: { token: "x" }, registry: REGISTRY, retries: 0, timeout: 2000 });
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/user",
      body: {},
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NpmApiErrorAuthOTP);
      expect(r.error).toBeInstanceOf(NpmApiError);
      expect(r.error.code).toBe("EOTP");
      expect(r.error.status).toBe(401);
    }
  });

  it("401 + www-authenticate: ipaddress -> NpmApiErrorAuthIPAddress / EAUTHIP", async () => {
    server.use(
      reg.post("/-/npm/v1/user", () =>
        HttpResponse.json(
          { error: "Login is not allowed" },
          { status: 401, headers: { "www-authenticate": "ipaddress" } },
        ),
      ),
    );
    const c = createClient({ auth: { token: "x" }, registry: REGISTRY, retries: 0, timeout: 2000 });
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/user",
      body: {},
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NpmApiErrorAuthIPAddress);
      expect(r.error.code).toBe("EAUTHIP");
    }
  });

  it("401 + other www-authenticate -> NpmApiErrorAuthUnknown / E401", async () => {
    server.use(
      reg.post("/-/npm/v1/user", () =>
        HttpResponse.json(
          { error: "nope" },
          { status: 401, headers: { "www-authenticate": 'Bearer realm="npm"' } },
        ),
      ),
    );
    const c = createClient({ auth: { token: "x" }, registry: REGISTRY, retries: 0, timeout: 2000 });
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/user",
      body: {},
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NpmApiErrorAuthUnknown);
      expect(r.error.code).toBe("E401");
    }
  });

  it("409 (no auth challenge) -> NpmApiErrorGeneral / E409", async () => {
    server.use(
      reg.put("/-/user/org.couchdb.user:foo", () =>
        HttpResponse.json({ error: "conflict" }, { status: 409 }),
      ),
    );
    const c = createClient({ auth: { token: "x" }, registry: REGISTRY, retries: 0, timeout: 2000 });
    const r = await c.request({
      method: "PUT",
      path: "/-/user/org.couchdb.user:foo",
      body: { name: "foo" },
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NpmApiErrorGeneral);
      expect(r.error.code).toBe("E409");
      expect(r.error.status).toBe(409);
    }
  });

  it("401 without www-authenticate but body /one-time pass/ -> NpmApiErrorAuthOTP (heuristic)", async () => {
    server.use(
      reg.post("/-/npm/v1/user", () =>
        HttpResponse.text("A one-time pass is required.", { status: 401 }),
      ),
    );
    const c = createClient({ auth: { token: "x" }, registry: REGISTRY, retries: 0, timeout: 2000 });
    const r = await c.request({
      method: "POST",
      path: "/-/npm/v1/user",
      body: {},
      schema: z.unknown(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NpmApiErrorAuthOTP);
      expect(r.error.code).toBe("EOTP");
    }
  });
});

describe("basic auth override", () => {
  it("sends Authorization: Basic <base64(user:pass)> when basic is set", async () => {
    let authHeader = "";
    server.use(
      reg.put("/-/user/org.couchdb.user:foo/-rev/:rev", ({ request }) => {
        authHeader = request.headers.get("authorization") ?? "";
        return HttpResponse.json({ token: "npm_session_xxx" });
      }),
    );
    const c = createClient({
      auth: { token: "bearer_should_be_overridden" },
      registry: REGISTRY,
      retries: 0,
      timeout: 2000,
    });
    await c.request({
      method: "PUT",
      path: "/-/user/org.couchdb.user:foo/-rev/1-abc",
      body: { name: "foo" },
      basic: { username: "foo", password: "bar" },
      schema: z.unknown(),
    });
    expect(authHeader.startsWith("Basic ")).toBe(true);
    // base64("foo:bar") = "Zm9vOmJhcg=="
    expect(authHeader).toBe("Basic Zm9vOmJhcg==");
  });

  it("falls back to Bearer token when basic is not set", async () => {
    let authHeader = "";
    server.use(
      reg.get("/-/npm/v1/user", ({ request }) => {
        authHeader = request.headers.get("authorization") ?? "";
        return HttpResponse.json({ name: "x" });
      }),
    );
    const c = createClient({
      auth: { token: "npm_tok" },
      registry: REGISTRY,
      retries: 0,
      timeout: 2000,
    });
    await c.request({
      method: "GET",
      path: "/-/npm/v1/user",
      schema: z.unknown(),
    });
    expect(authHeader).toBe("Bearer npm_tok");
  });
});
