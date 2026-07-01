import { describe, expect, it } from "vite-plus/test";
import { verifyCredentials } from "../src/verify-credentials";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("verifyCredentials", () => {
  it("reports auth valid when listTokens succeeds (no OTP checked)", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", () =>
        HttpResponse.json({ objects: [{ key: "k1", name: "ci" }], total: 1 }),
      ),
    );
    const r = await verifyCredentials(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.authValid).toBe(true);
      expect(r.data.otpValid).toBeNull();
      expect(r.data.tokens).toHaveLength(1);
    }
  });

  it("reports auth invalid when listTokens returns 401", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    );
    const r = await verifyCredentials(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.authValid).toBe(false);
      expect(r.data.otpValid).toBeNull();
    }
  });

  it("reports OTP valid when the phantom delete returns 404 (OTP gate passed)", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", () => HttpResponse.json({ objects: [] })),
      // OTP correct → registry proceeds to token lookup → 404 (not found)
      reg.delete("/-/npm/v1/tokens/token/:token", () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );
    const r = await verifyCredentials(makeClient(), { otp: "123456" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.authValid).toBe(true);
      expect(r.data.otpValid).toBe(true);
      expect(r.data.requires2FA).toBe(false);
    }
  });

  it("reports OTP invalid when the phantom delete returns 401 (OTP gate rejected)", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", () => HttpResponse.json({ objects: [] })),
      // OTP wrong → registry rejects at the gate → 401
      reg.delete("/-/npm/v1/tokens/token/:token", () =>
        HttpResponse.json({ error: "OTP required" }, { status: 401 }),
      ),
    );
    const r = await verifyCredentials(makeClient(), { otp: "wrong" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.authValid).toBe(true);
      expect(r.data.otpValid).toBe(false);
      expect(r.data.requires2FA).toBe(true);
    }
  });

  it("uses a guaranteed-nonexistent token id for the OTP probe", async () => {
    let probedId = "";
    server.use(
      reg.get("/-/npm/v1/tokens", () => HttpResponse.json({ objects: [] })),
      reg.delete("/-/npm/v1/tokens/token/:token", ({ params }) => {
        probedId = String(params.token);
        return HttpResponse.json({ message: "not found" }, { status: 404 });
      }),
    );
    await verifyCredentials(makeClient(), { otp: "123456" });
    // a long zero-string that cannot be a real token id
    expect(probedId.length).toBeGreaterThanOrEqual(40);
    expect(/[^0]/.test(probedId)).toBe(false);
  });
});
