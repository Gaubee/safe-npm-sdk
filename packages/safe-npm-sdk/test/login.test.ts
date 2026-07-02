import { describe, expect, it } from "vite-plus/test";
import { http } from "msw";
import { loginCouch, loginWeb } from "../src/operations/login";
import { createClient } from "../src";
import { HttpResponse, REGISTRY, reg, startServer } from "./helpers";

const server = startServer();

/** An ANONYMOUS client — login is how you obtain a token. */
function anonClient() {
  return createClient({ registry: REGISTRY, retries: 0, timeout: 2000 });
}

describe("loginCouch", () => {
  it("creates a new user with an anonymous PUT and returns the token", async () => {
    let authHeader: string | null | undefined;
    let body: unknown;
    server.use(
      reg.put("/-/user/org.couchdb.user:foo", async ({ request }) => {
        authHeader = request.headers.get("authorization");
        body = await request.json();
        return HttpResponse.json({ token: "npm_session_abc" });
      }),
    );
    const r = await loginCouch("foo", "secret", {}, anonClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.token).toBe("npm_session_abc");
      expect(r.data.username).toBe("foo");
    }
    // anonymous: no Authorization header on the first PUT
    expect(authHeader).toBeNull();
    expect(body).toMatchObject({ name: "foo", type: "user", roles: [] });
  });

  it("forwards the OTP on the first PUT (required for 2FA accounts)", async () => {
    // For an account with 2FA enabled, the registry demands a one-time password
    // even on the first session-token PUT. npm-profile forwards opts.otp here;
    // the SDK must too, or login aborts with EOTP for 2FA accounts.
    let firstPutOtp: string | null | undefined;
    server.use(
      reg.put("/-/user/org.couchdb.user:foo", ({ request }) => {
        firstPutOtp = request.headers.get("npm-otp");
        return HttpResponse.json({ token: "npm_session_abc" });
      }),
    );
    const r = await loginCouch("foo", "secret", { otp: "246810" }, anonClient());
    expect(r.ok).toBe(true);
    // The first PUT carried the OTP as an npm-otp header.
    expect(firstPutOtp).toBe("246810");
  });

  it("on 409 (user exists): GET ?write=true then re-PUT at -rev with Basic auth", async () => {
    let revPutAuth: string | null | undefined;
    let revPutPath = "";
    let getQuery = "";
    server.use(
      // first PUT -> conflict
      reg.put("/-/user/org.couchdb.user:foo", () =>
        HttpResponse.json({ error: "Document update conflict" }, { status: 409 }),
      ),
      // GET ?write=true to read the existing doc + _rev
      reg.get("/-/user/org.couchdb.user:foo", ({ request }) => {
        getQuery = request.url.split("?")[1] ?? "";
        return HttpResponse.json({
          _id: "org.couchdb.user:foo",
          name: "foo",
          _rev: "3-cccc",
          type: "user",
          roles: ["dev"],
          someExtra: "kept",
        });
      }),
      // re-PUT at -rev/{rev}
      reg.put("/-/user/org.couchdb.user:foo/-rev/:rev", ({ request, params }) => {
        revPutAuth = request.headers.get("authorization");
        revPutPath = `/-/user/org.couchdb.user:foo/-rev/${String(params.rev)}`;
        return HttpResponse.json({ token: "npm_session_xyz" });
      }),
    );

    const r = await loginCouch("foo", "secret", { otp: "246810" }, anonClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.token).toBe("npm_session_xyz");
    // the GET used ?write=true
    expect(getQuery).toContain("write=true");
    // the re-PUT targeted the current rev
    expect(revPutPath).toBe("/-/user/org.couchdb.user:foo/-rev/3-cccc");
    // and carried Basic auth (username:password), not anonymous
    expect(revPutAuth?.startsWith("Basic ")).toBe(true);
  });

  it("on 400: surfaces the 'no user with the username' message", async () => {
    server.use(
      reg.put("/-/user/org.couchdb.user:nope", () =>
        HttpResponse.json({ error: "Bad Request" }, { status: 400 }),
      ),
    );
    const r = await loginCouch("nope", "secret", {}, anonClient());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("E400");
      expect(r.error.message).toContain('no user with the username "nope"');
    }
  });
});

describe("loginWeb", () => {
  it("returns a handle with loginUrl + doneUrl from POST /-/v1/login", async () => {
    server.use(
      reg.post("/-/v1/login", () =>
        HttpResponse.json({
          loginUrl: "https://www.npmjs.com/login/abc",
          doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
        }),
      ),
    );
    const r = await loginWeb({}, anonClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.loginUrl).toBe("https://www.npmjs.com/login/abc");
      // canonical host matches the default registry, so doneUrl is unchanged
      expect(r.data.doneUrl).toContain("/-/v1/done?authId=abc");
      expect(typeof r.data.done).toBe("function");
    }
  });

  it("done() resolves with the token on 200", async () => {
    server.use(
      reg.post("/-/v1/login", () =>
        HttpResponse.json({
          loginUrl: "https://www.npmjs.com/login/abc",
          doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
        }),
      ),
      reg.get("/-/v1/done", () => HttpResponse.json({ token: "npm_web_token_123" })),
    );
    const r = await loginWeb({}, anonClient());
    if (!r.ok) throw new Error("init failed");
    const done = await r.data.done({ intervalMs: 10, timeoutMs: 1000 });
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.data.token).toBe("npm_web_token_123");
  });

  it("done() polls on 202 then resolves on 200", async () => {
    let doneCalls = 0;
    server.use(
      reg.post("/-/v1/login", () =>
        HttpResponse.json({
          loginUrl: "https://www.npmjs.com/login/abc",
          doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
        }),
      ),
      reg.get("/-/v1/done", () => {
        doneCalls += 1;
        if (doneCalls < 3) {
          // still pending
          return new HttpResponse(null, { status: 202 });
        }
        return HttpResponse.json({ token: "npm_web_token_after_poll" });
      }),
    );
    const r = await loginWeb({}, anonClient());
    if (!r.ok) throw new Error("init failed");
    const done = await r.data.done({ intervalMs: 5, timeoutMs: 2000 });
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.data.token).toBe("npm_web_token_after_poll");
    expect(doneCalls).toBe(3);
  });

  it("done() errors on timeout", async () => {
    server.use(
      reg.post("/-/v1/login", () =>
        HttpResponse.json({
          loginUrl: "https://www.npmjs.com/login/abc",
          doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
        }),
      ),
      // forever pending
      reg.get("/-/v1/done", () => new HttpResponse(null, { status: 202 })),
    );
    const r = await loginWeb({}, anonClient());
    if (!r.ok) throw new Error("init failed");
    const done = await r.data.done({ intervalMs: 5, timeoutMs: 30 });
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.error.message).toContain("timed out");
  });
});

describe("loginWeb host rewrite (proxy/mirror support)", () => {
  it("rewrites the canonical registry host in doneUrl to the configured registry", async () => {
    // client pointed at a mirror
    const mirrorClient = createClient({
      registry: "https://npm.mirror.local",
      retries: 0,
      timeout: 2000,
    });
    server.use(
      http.post("https://npm.mirror.local/-/v1/login", () =>
        HttpResponse.json({
          loginUrl: "https://www.npmjs.com/login/abc",
          // canonical npmjs host in doneUrl
          doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
        }),
      ),
    );
    const r = await loginWeb({}, mirrorClient);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // doneUrl host rewritten to the mirror, path + query preserved
      expect(r.data.doneUrl).toBe("https://npm.mirror.local/-/v1/done?authId=abc");
    }
  });
});
