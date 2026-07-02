import { describe, expect, it } from "vite-plus/test";
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  getProfile,
  updateProfile,
} from "../src/operations/profile";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

const BASE_PROFILE = {
  tfa: null,
  name: "gaubee",
  email: "me@example.com",
  email_verified: true,
  created: "2024-01-01T00:00:00.000Z",
  updated: "2025-06-01T00:00:00.000Z",
  cidr_whitelist: null,
  fullname: "Gaubee",
  homepage: "https://example.com",
};

describe("getProfile", () => {
  it("parses a profile with 2FA disabled (tfa: null)", async () => {
    server.use(reg.get("/-/npm/v1/user", () => HttpResponse.json(BASE_PROFILE)));
    const r = await getProfile(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("gaubee");
      expect(r.data.tfa).toBeNull();
      expect(r.data.email_verified).toBe(true);
      expect(r.data.fullname).toBe("Gaubee");
    }
  });

  it("parses a profile with recovery-code tfa (string[])", async () => {
    server.use(
      reg.get("/-/npm/v1/user", () =>
        HttpResponse.json({ ...BASE_PROFILE, tfa: ["r1", "r2", "r3", "r4", "r5"] }),
      ),
    );
    const r = await getProfile(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.isArray(r.data.tfa)).toBe(true);
  });

  it("parses a profile with pending 2FA setup ({ mode, pending })", async () => {
    server.use(
      reg.get("/-/npm/v1/user", () =>
        HttpResponse.json({ ...BASE_PROFILE, tfa: { mode: "auth-and-writes", pending: true } }),
      ),
    );
    const r = await getProfile(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.tfa).toEqual({ mode: "auth-and-writes", pending: true });
    }
  });
});

describe("updateProfile", () => {
  it("coerces empty strings to null (npm-profile parity) and sends npm-otp", async () => {
    let received: unknown;
    let otpHeader: string | null | undefined;
    server.use(
      reg.post("/-/npm/v1/user", async ({ request }) => {
        received = await request.json();
        otpHeader = request.headers.get("npm-otp");
        return HttpResponse.json({ ...BASE_PROFILE, fullname: null });
      }),
    );
    const r = await updateProfile(
      { fullname: "", homepage: "https://x.com" },
      { otp: "987654" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
    expect(otpHeader).toBe("987654");
    // '' coerced to null; real value passed through.
    expect(received).toEqual({ fullname: null, homepage: "https://x.com" });
  });
});

describe("changePassword", () => {
  it("sends { password: { old, new } }", async () => {
    let received: unknown;
    server.use(
      reg.post("/-/npm/v1/user", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(BASE_PROFILE);
      }),
    );
    const r = await changePassword("old-pass", "new-pass", { otp: "111111" }, makeClient());
    expect(r.ok).toBe(true);
    expect(received).toEqual({ password: { old: "old-pass", new: "new-pass" } });
  });
});

describe("enableTwoFactor", () => {
  it("runs the two-step flow: otpauth URL → code → recovery codes", async () => {
    const otpauth = "otpauth://totp/npm:gaubee?secret=JBSWY3DPEHPK3PXP&issuer=npm";
    let call = 0;
    let secondBody: unknown;
    server.use(
      reg.post("/-/npm/v1/user", async ({ request }) => {
        call += 1;
        const body = (await request.json()) as { tfa?: unknown };
        if (call === 1) {
          // Step 1 response: the otpauth URL.
          return HttpResponse.json({ ...BASE_PROFILE, tfa: otpauth });
        }
        // Step 3: caller submitted the one-time code; return recovery codes.
        secondBody = body;
        return HttpResponse.json({ ...BASE_PROFILE, tfa: ["c1", "c2", "c3", "c4", "c5"] });
      }),
    );

    const r = await enableTwoFactor(
      {
        mode: "auth-and-writes",
        password: "pw",
        promptForCode: async (url) => {
          expect(url).toBe(otpauth);
          return "123456";
        },
      },
      { otp: null },
      makeClient(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.recoveryCodes).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    // second request submitted the code as a single-element array
    expect(secondBody).toEqual({ tfa: ["123456"] });
  });

  it("aborts (no writes beyond step 1) when promptForCode returns null", async () => {
    const otpauth = "otpauth://totp/npm:gaubee?secret=XXX";
    let calls = 0;
    server.use(
      reg.post("/-/npm/v1/user", () => {
        calls += 1;
        return HttpResponse.json({ ...BASE_PROFILE, tfa: otpauth });
      }),
    );
    const r = await enableTwoFactor(
      {
        mode: "auth-only",
        password: "pw",
        promptForCode: async () => null,
      },
      { otp: null },
      makeClient(),
    );
    expect(r.ok).toBe(false);
    // only the first (setup) request fired; no confirmation code was sent
    expect(calls).toBe(1);
    if (!r.ok) expect(r.error.message).toContain("aborted");
  });
});

describe("disableTwoFactor", () => {
  it("sends { tfa: { mode: 'disable', password } }", async () => {
    let received: unknown;
    server.use(
      reg.post("/-/npm/v1/user", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ...BASE_PROFILE, tfa: null });
      }),
    );
    const r = await disableTwoFactor("pw", { otp: "222222" }, makeClient());
    expect(r.ok).toBe(true);
    expect(received).toEqual({ tfa: { mode: "disable", password: "pw" } });
  });
});
